/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getTabSizeSetting } from '../shared/utilities/editorUtilities'
import { KeyStrokeHandler } from './service/keyStrokeHandler'
import * as EditorContext from './util/editorContext'
import * as CodeWhispererConstants from './models/constants'
import { getCompletionItems } from './service/completionProvider'
import { vsCodeState, ConfigurationEntry } from './models/model'
import { invokeRecommendation } from './commands/invokeRecommendation'
import { acceptSuggestion } from './commands/onInlineAcceptance'
import { resetIntelliSenseState } from './util/globalStateUtil'
import { CodeWhispererSettings } from './util/codewhispererSettings'
import { ExtContext } from '../shared/extensions'
import { TextEditorSelectionChangeKind } from 'vscode'
import { CodeWhispererTracker } from './tracker/codewhispererTracker'
import * as codewhispererClient from './client/codewhisperer'
import { runtimeLanguageContext } from './util/runtimeLanguageContext'
import { getLogger } from '../shared/logger'
import { isCloud9 } from '../shared/extensionUtilities'
import {
    enableCodeSuggestions,
    toggleCodeSuggestions,
    showReferenceLog,
    showSecurityScan,
    showLearnMore,
    showSsoSignIn,
    showFreeTierLimit,
    updateReferenceLog,
    showIntroduction,
    reconnect,
    refreshStatusBar,
} from './commands/basicCommands'
import { sleep } from '../shared/utilities/timeoutUtils'
import { ReferenceLogViewProvider } from './service/referenceLogViewProvider'
import { ReferenceHoverProvider } from './service/referenceHoverProvider'
import { ReferenceInlineProvider } from './service/referenceInlineProvider'
import { SecurityPanelViewProvider } from './views/securityPanelViewProvider'
import { disposeSecurityDiagnostic } from './service/diagnosticsProvider'
import { RecommendationHandler } from './service/recommendationHandler'
import { Commands } from '../shared/vscode/commands2'
import { InlineCompletionService } from './service/inlineCompletionService'
import { isInlineCompletionEnabled } from './util/commonUtil'
import { CodeWhispererCodeCoverageTracker } from './tracker/codewhispererCodeCoverageTracker'
import { AuthUtil } from './util/authUtil'
import { ImportAdderProvider } from './service/importAdderProvider'
import { TelemetryHelper } from './util/telemetryHelper'
import { openUrl } from '../shared/utilities/vsCodeUtils'

const performance = globalThis.performance ?? require('perf_hooks').performance

export async function activate(context: ExtContext): Promise<void> {
    const codewhispererSettings = CodeWhispererSettings.instance
    // initialize AuthUtil earlier to make sure it can listen to connection change events.
    const auth = AuthUtil.instance
    /**
     * Enable essential intellisense default settings for AWS C9 IDE
     */

    if (isCloud9()) {
        await enableDefaultConfigCloud9()
    }

    /**
     * CodeWhisperer security panel
     */
    const securityPanelViewProvider = new SecurityPanelViewProvider(context.extensionContext)
    activateSecurityScan()

    /**
     * Service control
     */
    const client = new codewhispererClient.DefaultCodeWhispererClient()

    context.extensionContext.subscriptions.push(
        /**
         * Configuration change
         */
        vscode.workspace.onDidChangeConfiguration(async configurationChangeEvent => {
            if (configurationChangeEvent.affectsConfiguration('editor.tabSize')) {
                EditorContext.updateTabSize(getTabSizeSetting())
            }

            if (
                configurationChangeEvent.affectsConfiguration('aws.codeWhisperer.includeSuggestionsWithCodeReferences')
            ) {
                ReferenceLogViewProvider.instance.update()
                if (auth.isEnterpriseSsoInUse()) {
                    await vscode.window
                        .showInformationMessage(
                            CodeWhispererConstants.ssoConfigAlertMessage,
                            CodeWhispererConstants.settingsLearnMore
                        )
                        .then(async resp => {
                            if (resp === CodeWhispererConstants.settingsLearnMore) {
                                openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
                            }
                        })
                }
            }

            if (configurationChangeEvent.affectsConfiguration('aws.codeWhisperer.shareCodeWhispererContentWithAWS')) {
                if (auth.isEnterpriseSsoInUse()) {
                    await vscode.window
                        .showInformationMessage(
                            CodeWhispererConstants.ssoConfigAlertMessageShareData,
                            CodeWhispererConstants.settingsLearnMore
                        )
                        .then(async resp => {
                            if (resp === CodeWhispererConstants.settingsLearnMore) {
                                openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
                            }
                        })
                }
            }

            if (configurationChangeEvent.affectsConfiguration('editor.inlineSuggest.enabled')) {
                await vscode.window
                    .showInformationMessage(
                        CodeWhispererConstants.reloadWindowPrompt,
                        CodeWhispererConstants.reloadWindow
                    )
                    .then(selected => {
                        if (selected === CodeWhispererConstants.reloadWindow) {
                            vscode.commands.executeCommand('workbench.action.reloadWindow')
                        }
                    })
            }
        }),
        /**
         * Open Configuration
         */
        Commands.register('aws.codeWhisperer.configure', async id => {
            if (id === 'codewhisperer') {
                await vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    `@id:aws.codeWhisperer.includeSuggestionsWithCodeReferences`
                )
            } else {
                await vscode.commands.executeCommand('workbench.action.openSettings', `aws.codeWhisperer`)
            }
        }),
        // show introduction
        showIntroduction.register(),
        // toggle code suggestions
        toggleCodeSuggestions.register(context.extensionContext.globalState),
        // enable code suggestions
        enableCodeSuggestions.register(context),
        // code scan
        showSecurityScan.register(context, securityPanelViewProvider, client),
        // sign in with sso or AWS ID
        showSsoSignIn.register(),
        // show reconnect prompt
        reconnect.register(),
        // learn more about CodeWhisperer
        showLearnMore.register(),
        // show free tier limit
        showFreeTierLimit.register(),
        // update reference log instance
        updateReferenceLog.register(),
        // refresh codewhisperer status bar
        refreshStatusBar.register(),
        // manual trigger
        Commands.register({ id: 'aws.codeWhisperer', autoconnect: true }, async () => {
            invokeRecommendation(vscode.window.activeTextEditor as vscode.TextEditor, client, await getConfigEntry())
        }),
        /**
         * On recommendation acceptance
         */
        acceptSuggestion.register(context),
        // on text document close.
        vscode.workspace.onDidCloseTextDocument(e => {
            if (isInlineCompletionEnabled() && e.uri.fsPath !== InlineCompletionService.instance.filePath()) {
                return
            }
            RecommendationHandler.instance.reportUserDecisionOfRecommendation(vscode.window.activeTextEditor, -1)
            RecommendationHandler.instance.clearRecommendations()
        }),

        vscode.languages.registerHoverProvider(
            [...CodeWhispererConstants.supportedLanguages],
            ReferenceHoverProvider.instance
        ),
        vscode.window.registerWebviewViewProvider(ReferenceLogViewProvider.viewType, ReferenceLogViewProvider.instance),
        showReferenceLog.register(context),
        vscode.languages.registerCodeLensProvider(
            [...CodeWhispererConstants.supportedLanguages],
            ReferenceInlineProvider.instance
        ),
        vscode.languages.registerCodeLensProvider(
            [...CodeWhispererConstants.supportedLanguages, { scheme: 'untitled' }],
            ImportAdderProvider.instance
        )
    )

    await auth.restore()

    function activateSecurityScan() {
        context.extensionContext.subscriptions.push(
            vscode.window.registerWebviewViewProvider(SecurityPanelViewProvider.viewType, securityPanelViewProvider)
        )

        context.extensionContext.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (isCloud9()) {
                    if (editor) {
                        securityPanelViewProvider.setDecoration(editor, editor.document.uri)
                    }
                }
            })
        )
    }

    function getAutoTriggerStatus(): boolean {
        return context.extensionContext.globalState.get<boolean>(CodeWhispererConstants.autoTriggerEnabledKey) || false
    }

    async function getConfigEntry(): Promise<ConfigurationEntry> {
        const isShowMethodsEnabled: boolean =
            vscode.workspace.getConfiguration('editor').get('suggest.showMethods') || false
        const isAutomatedTriggerEnabled: boolean = getAutoTriggerStatus()
        const isManualTriggerEnabled: boolean = true
        const isSuggestionsWithCodeReferencesEnabled = codewhispererSettings.isSuggestionsWithCodeReferencesEnabled()

        // TODO:remove isManualTriggerEnabled
        return {
            isShowMethodsEnabled,
            isManualTriggerEnabled,
            isAutomatedTriggerEnabled,
            isSuggestionsWithCodeReferencesEnabled,
        }
    }

    if (isCloud9()) {
        setSubscriptionsforCloud9()
    } else if (isInlineCompletionEnabled()) {
        await setSubscriptionsforInlineCompletion()
        await vscode.commands.executeCommand('setContext', 'CODEWHISPERER_ENABLED', AuthUtil.instance.isConnected())
    }

    async function setSubscriptionsforInlineCompletion() {
        /**
         * Automated trigger
         */
        context.extensionContext.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(async editor => {
                await InlineCompletionService.instance.onEditorChange()
            }),
            vscode.window.onDidChangeWindowState(async e => {
                await InlineCompletionService.instance.onFocusChange()
            }),
            vscode.window.onDidChangeTextEditorSelection(async e => {
                await InlineCompletionService.instance.onCursorChange(e)
            }),
            vscode.workspace.onDidChangeTextDocument(async e => {
                /**
                 * CodeWhisperer security panel dynamic handling
                 */
                if (e.document === vscode.window.activeTextEditor?.document) {
                    disposeSecurityDiagnostic(e)
                }
                /**
                 * Handle this keystroke event only when
                 * 1. It is in current non plaintext active editor
                 * 2. It is not a backspace
                 * 3. It is not caused by CodeWhisperer editing
                 * 4. It is not from undo/redo.
                 */
                if (
                    e.document === vscode.window.activeTextEditor?.document &&
                    runtimeLanguageContext.isLanguageSupported(e.document.languageId) &&
                    e.contentChanges.length != 0 &&
                    !vsCodeState.isCodeWhispererEditing
                ) {
                    if (vsCodeState.lastUserModificationTime) {
                        TelemetryHelper.instance.setTimeSinceLastModification(
                            performance.now() - vsCodeState.lastUserModificationTime
                        )
                    }
                    vsCodeState.lastUserModificationTime = performance.now()
                    /**
                     * Important:  Doing this sleep(10) is to make sure
                     * 1. this event is processed by vs code first
                     * 2. editor.selection.active has been successfully updated by VS Code
                     * Then this event can be processed by our code.
                     */
                    await sleep(CodeWhispererConstants.vsCodeCursorUpdateDelay)
                    if (!InlineCompletionService.instance.isSuggestionVisible()) {
                        await KeyStrokeHandler.instance.processKeyStroke(
                            e,
                            vscode.window.activeTextEditor,
                            client,
                            await getConfigEntry()
                        )
                    }
                }
            })
        )
    }

    function setSubscriptionsforCloud9() {
        /**
         * Manual trigger
         */
        context.extensionContext.subscriptions.push(
            vscode.languages.registerCompletionItemProvider([...CodeWhispererConstants.supportedLanguages], {
                async provideCompletionItems(
                    document: vscode.TextDocument,
                    position: vscode.Position,
                    token: vscode.CancellationToken,
                    context: vscode.CompletionContext
                ) {
                    const completionList = new vscode.CompletionList(getCompletionItems(document, position), false)
                    return completionList
                },
            }),
            /**
             * Automated trigger
             */
            vscode.workspace.onDidChangeTextDocument(async e => {
                /**
                 * CodeWhisperer security panel dynamic handling
                 */
                if (e.document === vscode.window.activeTextEditor?.document) {
                    if (isCloud9()) {
                        securityPanelViewProvider.disposeSecurityPanelItem(e, vscode.window.activeTextEditor)
                    } else {
                        disposeSecurityDiagnostic(e)
                    }
                }

                CodeWhispererCodeCoverageTracker.getTracker(e.document.languageId)?.countTotalTokens(e)

                if (
                    e.document === vscode.window.activeTextEditor?.document &&
                    runtimeLanguageContext.isLanguageSupported(e.document.languageId) &&
                    e.contentChanges.length != 0 &&
                    !vsCodeState.isCodeWhispererEditing
                ) {
                    /**
                     * Important:  Doing this sleep(10) is to make sure
                     * 1. this event is processed by vs code first
                     * 2. editor.selection.active has been successfully updated by VS Code
                     * Then this event can be processed by our code.
                     */
                    await sleep(CodeWhispererConstants.vsCodeCursorUpdateDelay)
                    await KeyStrokeHandler.instance.processKeyStroke(
                        e,
                        vscode.window.activeTextEditor,
                        client,
                        await getConfigEntry()
                    )
                }
            }),

            /**
             * On intelliSense recommendation rejection, reset set intelli sense is active state
             * Maintaining this variable because VS Code does not expose official intelliSense isActive API
             */
            vscode.window.onDidChangeVisibleTextEditors(async e => {
                resetIntelliSenseState(true, getAutoTriggerStatus(), RecommendationHandler.instance.isValidResponse())
            }),
            vscode.window.onDidChangeActiveTextEditor(async e => {
                resetIntelliSenseState(true, getAutoTriggerStatus(), RecommendationHandler.instance.isValidResponse())
            }),
            vscode.window.onDidChangeTextEditorSelection(async e => {
                if (e.kind === TextEditorSelectionChangeKind.Mouse) {
                    resetIntelliSenseState(
                        true,
                        getAutoTriggerStatus(),
                        RecommendationHandler.instance.isValidResponse()
                    )
                }
            }),
            vscode.workspace.onDidSaveTextDocument(async e => {
                resetIntelliSenseState(true, getAutoTriggerStatus(), RecommendationHandler.instance.isValidResponse())
            })
        )
    }
}

export async function shutdown() {
    if (isCloud9()) {
        RecommendationHandler.instance.reportUserDecisionOfRecommendation(vscode.window.activeTextEditor, -1)
        RecommendationHandler.instance.clearRecommendations()
    }
    if (isInlineCompletionEnabled()) {
        await InlineCompletionService.instance.clearInlineCompletionStates(vscode.window.activeTextEditor)
    }
    CodeWhispererTracker.getTracker().shutdown()
}

export async function enableDefaultConfigCloud9() {
    const editorSettings = vscode.workspace.getConfiguration('editor')
    try {
        await editorSettings.update('suggest.showMethods', true, vscode.ConfigurationTarget.Global)
        // suggest.preview is available in vsc 1.57+
        await editorSettings.update('suggest.preview', true, vscode.ConfigurationTarget.Global)
        await editorSettings.update('acceptSuggestionOnEnter', 'on', vscode.ConfigurationTarget.Global)
        await editorSettings.update('snippetSuggestions', 'top', vscode.ConfigurationTarget.Global)
    } catch (error) {
        getLogger().error('codewhisperer: Failed to update user settings', error)
    }
}
