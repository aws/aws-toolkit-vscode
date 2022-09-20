/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getTabSizeSetting } from '../shared/utilities/editorUtilities'
import { KeyStrokeHandler } from './service/keyStrokeHandler'
import * as EditorContext from './util/editorContext'
import * as CodeWhispererConstants from './models/constants'
import { getCompletionItems } from './service/completionProvider'
import { vsCodeState, ConfigurationEntry } from './models/model'
import { InlineCompletion } from './service/inlineCompletion'
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
    showIntroduction,
    showReferenceLog,
    set,
    get,
    enterAccessToken,
    requestAccess,
    showSecurityScan,
    requestAccessCloud9,
    updateCloud9TreeNodes,
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
import { HoverConfigUtil } from './util/hoverConfigUtil'
import { CodeWhispererCodeCoverageTracker } from './tracker/codewhispererCodeCoverageTracker'

const performance = globalThis.performance ?? require('perf_hooks').performance

export async function activate(context: ExtContext): Promise<void> {
    const codewhispererSettings = CodeWhispererSettings.instance
    if (!codewhispererSettings.isEnabled()) {
        return
    }

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
            if (configurationChangeEvent.affectsConfiguration('aws.experiments')) {
                const codewhispererEnabled = await codewhispererSettings.isEnabled()
                if (!codewhispererEnabled) {
                    await set(CodeWhispererConstants.termsAcceptedKey, false, context.extensionContext.globalState)
                    await set(CodeWhispererConstants.autoTriggerEnabledKey, false, context.extensionContext.globalState)
                    if (!isCloud9()) {
                        hideStatusBar()
                    }
                }
                vscode.commands.executeCommand('aws.codeWhisperer.refresh')
            }
            if (configurationChangeEvent.affectsConfiguration('aws.codeWhisperer')) {
                ReferenceLogViewProvider.instance.update()
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
         * Accept terms of service
         */
        Commands.register('aws.codeWhisperer.acceptTermsOfService', async () => {
            await set(CodeWhispererConstants.autoTriggerEnabledKey, true, context.extensionContext.globalState)
            await set(CodeWhispererConstants.termsAcceptedKey, true, context.extensionContext.globalState)
            await vscode.commands.executeCommand('setContext', CodeWhispererConstants.termsAcceptedKey, true)
            await vscode.commands.executeCommand('aws.codeWhisperer.refresh')

            const isShow = get(CodeWhispererConstants.welcomeMessageKey, context.extensionContext.globalState)
            if (!isShow) {
                showCodeWhispererWelcomeMessage()
                await set(CodeWhispererConstants.welcomeMessageKey, true, context.extensionContext.globalState)
            }
            if (!isCloud9()) {
                setStatusBarOK()
            }
        }),
        /**
         * Cancel terms of service
         */
        Commands.register('aws.codeWhisperer.cancelTermsOfService', async () => {
            await set(CodeWhispererConstants.autoTriggerEnabledKey, false, context.extensionContext.globalState)
            await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
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
                await vscode.commands.executeCommand('workbench.action.openSettings', `@id:aws.experiments`)
            }
        }),
        // show introduction
        showIntroduction.register(),
        // toggle code suggestions
        toggleCodeSuggestions.register(context.extensionContext.globalState),
        // enable code suggestions
        enableCodeSuggestions.register(context),
        // enter access token
        enterAccessToken.register(context.extensionContext.globalState, client),
        // request access
        requestAccess.register(),
        // code scan
        showSecurityScan.register(context, securityPanelViewProvider, client),
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
            RecommendationHandler.instance.reportUserDecisionOfCurrentRecommendation(vscode.window.activeTextEditor, -1)
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
        )
    )

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

    function hideStatusBar() {
        if (isInlineCompletionEnabled()) {
            InlineCompletionService.instance.hideCodeWhispererStatusBar()
        } else {
            InlineCompletion.instance.hideCodeWhispererStatusBar()
        }
    }

    function setStatusBarOK() {
        if (isInlineCompletionEnabled()) {
            InlineCompletionService.instance.setCodeWhispererStatusBarOk()
        } else {
            InlineCompletion.instance.setCodeWhispererStatusBarOk()
        }
    }

    async function showCodeWhispererWelcomeMessage(): Promise<void> {
        const filePath = isCloud9()
            ? context.extensionContext.asAbsolutePath(CodeWhispererConstants.welcomeCodeWhispererCloud9ReadmeFileSource)
            : context.extensionContext.asAbsolutePath(CodeWhispererConstants.welcomeCodeWhispererReadmeFileSource)
        const readmeUri = vscode.Uri.file(filePath)
        await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
    }

    async function getManualTriggerStatus(): Promise<boolean> {
        const codewhispererEnabled = await codewhispererSettings.isEnabled()
        const acceptedTerms: boolean =
            context.extensionContext.globalState.get<boolean>(CodeWhispererConstants.termsAcceptedKey) || false
        return acceptedTerms && codewhispererEnabled
    }

    function getAutoTriggerStatus(): boolean {
        return context.extensionContext.globalState.get<boolean>(CodeWhispererConstants.autoTriggerEnabledKey) || false
    }

    async function getConfigEntry(): Promise<ConfigurationEntry> {
        const isShowMethodsEnabled: boolean =
            vscode.workspace.getConfiguration('editor').get('suggest.showMethods') || false
        const isAutomatedTriggerEnabled: boolean = getAutoTriggerStatus()
        const isManualTriggerEnabled: boolean = await getManualTriggerStatus()
        const isIncludeSuggestionsWithCodeReferencesEnabled =
            codewhispererSettings.isIncludeSuggestionsWithCodeReferencesEnabled()
        return {
            isShowMethodsEnabled,
            isManualTriggerEnabled,
            isAutomatedTriggerEnabled,
            isIncludeSuggestionsWithCodeReferencesEnabled,
        }
    }

    if (isCloud9()) {
        setSubscriptionsforCloud9()
        updateCloud9TreeNodes.execute()
    } else if (isInlineCompletionEnabled()) {
        await setSubscriptionsforInlineCompletion()
    } else {
        await setSubscriptionsforVsCodeInline()
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

    async function setSubscriptionsforVsCodeInline() {
        /**
         * Automated trigger
         */
        context.extensionContext.subscriptions.push(
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

                CodeWhispererCodeCoverageTracker.getTracker(
                    e.document.languageId,
                    context.extensionContext.globalState
                )?.countTotalTokens(e)
                /**
                 * Handle this keystroke event only when
                 * 1. It is in current active editor with cwspr supported file types
                 * 2. It is not a backspace
                 * 3. It is not caused by CodeWhisperer editing
                 * 4. It is not from undo/redo.
                 */
                if (
                    e.document === vscode.window.activeTextEditor?.document &&
                    runtimeLanguageContext.isLanguageSupported(e.document.languageId) &&
                    e.contentChanges.length != 0 &&
                    !vsCodeState.isCodeWhispererEditing &&
                    !JSON.stringify(e).includes('reason')
                ) {
                    vsCodeState.lastUserModificationTime = performance.now()
                    /**
                     * Important:  Doing this sleep(10) is to make sure
                     * 1. this event is processed by vs code first
                     * 2. editor.selection.active has been successfully updated by VS Code
                     * Then this event can be processed by our code.
                     */
                    await sleep(CodeWhispererConstants.vsCodeCursorUpdateDelay)
                    if (InlineCompletion.instance.getIsActive) {
                        await InlineCompletion.instance.setTypeAheadRecommendations(vscode.window.activeTextEditor, e)
                    } else {
                        await KeyStrokeHandler.instance.processKeyStroke(
                            e,
                            vscode.window.activeTextEditor,
                            client,
                            await getConfigEntry()
                        )
                    }
                }
            }),

            /**
             * On recommendation rejection
             */
            vscode.window.onDidChangeVisibleTextEditors(async e => {
                await InlineCompletion.instance.rejectRecommendation(vscode.window.activeTextEditor, false, true)
            }),
            vscode.window.onDidChangeActiveTextEditor(async e => {
                await InlineCompletion.instance.rejectRecommendation(vscode.window.activeTextEditor)
                if (vscode.window.activeTextEditor) {
                    CodeWhispererCodeCoverageTracker.getTracker(
                        vscode.window.activeTextEditor.document.languageId,
                        context.extensionContext.globalState
                    )?.updateAcceptedTokensCount(vscode.window.activeTextEditor)
                }
            }),
            vscode.window.onDidChangeTextEditorSelection(async e => {
                if (e.kind === TextEditorSelectionChangeKind.Mouse && vscode.window.activeTextEditor) {
                    await InlineCompletion.instance.rejectRecommendation(vscode.window.activeTextEditor)
                }
            }),
            Commands.register('aws.codeWhisperer.rejectCodeSuggestion', async e => {
                if (vscode.window.activeTextEditor) {
                    await InlineCompletion.instance.rejectRecommendation(vscode.window.activeTextEditor)
                    if (e === 'up') {
                        await vscode.commands.executeCommand('cursorUp')
                    } else if (e === 'down') {
                        await vscode.commands.executeCommand('cursorDown')
                    } else if (e !== undefined) {
                        getLogger().warn(`Unexpected argument for rejectCodeSuggestion ${e}`)
                    }
                }
            }),
            /**
             * Recommendation navigation
             */
            Commands.register('aws.codeWhisperer.nextCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor)
                    InlineCompletion.instance.navigateRecommendation(vscode.window.activeTextEditor, true)
            }),
            Commands.register('aws.codeWhisperer.previousCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor)
                    InlineCompletion.instance.navigateRecommendation(vscode.window.activeTextEditor, false)
            }),
            /**
             * Recommendation acceptance
             */
            Commands.register('aws.codeWhisperer.acceptCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor)
                    await InlineCompletion.instance.acceptRecommendation(vscode.window.activeTextEditor)
            })
        )
        // If the vscode is refreshed we need to maintain the status bar
        const acceptedTermsAndEnabledCodeWhisperer: boolean = await getManualTriggerStatus()
        if (acceptedTermsAndEnabledCodeWhisperer) {
            InlineCompletion.instance.setCodeWhispererStatusBarOk()
        }
    }

    function setSubscriptionsforCloud9() {
        /**
         * Manual trigger
         */
        context.extensionContext.subscriptions.push(
            // request access C9
            requestAccessCloud9.register(context.extensionContext.globalState),
            updateCloud9TreeNodes.register(context.extensionContext.globalState),
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

                CodeWhispererCodeCoverageTracker.getTracker(
                    e.document.languageId,
                    context.extensionContext.globalState
                )?.countTotalTokens(e)

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
                resetIntelliSenseState(
                    await getManualTriggerStatus(),
                    getAutoTriggerStatus(),
                    RecommendationHandler.instance.isValidResponse()
                )
            }),
            vscode.window.onDidChangeActiveTextEditor(async e => {
                resetIntelliSenseState(
                    await getManualTriggerStatus(),
                    getAutoTriggerStatus(),
                    RecommendationHandler.instance.isValidResponse()
                )
            }),
            vscode.window.onDidChangeTextEditorSelection(async e => {
                if (e.kind === TextEditorSelectionChangeKind.Mouse) {
                    resetIntelliSenseState(
                        await getManualTriggerStatus(),
                        getAutoTriggerStatus(),
                        RecommendationHandler.instance.isValidResponse()
                    )
                }
            }),
            vscode.workspace.onDidSaveTextDocument(async e => {
                resetIntelliSenseState(
                    await getManualTriggerStatus(),
                    getAutoTriggerStatus(),
                    RecommendationHandler.instance.isValidResponse()
                )
            })
        )
    }
}

export async function shutdown() {
    if (isCloud9()) {
        RecommendationHandler.instance.reportUserDecisionOfCurrentRecommendation(vscode.window.activeTextEditor, -1)
        RecommendationHandler.instance.clearRecommendations()
    }
    if (isInlineCompletionEnabled()) {
        await InlineCompletionService.instance.clearInlineCompletionStates(vscode.window.activeTextEditor)
        await HoverConfigUtil.instance.restoreHoverConfig()
    } else {
        if (vscode.window.activeTextEditor)
            await InlineCompletion.instance.resetInlineStates(vscode.window.activeTextEditor)
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
