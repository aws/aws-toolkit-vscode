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
    showReferenceLog,
    set,
    get,
    showSecurityScan,
    showLearnMore,
    showSsoSignIn,
    showFreeTierLimit,
    updateReferenceLog,
    showIntroduction,
    showAccessTokenErrorLearnMore,
} from './commands/basicCommands'
import { sleep } from '../shared/utilities/timeoutUtils'
import { ReferenceLogViewProvider } from './service/referenceLogViewProvider'
import { ReferenceHoverProvider } from './service/referenceHoverProvider'
import { ReferenceInlineProvider } from './service/referenceInlineProvider'
import { SecurityPanelViewProvider } from './views/securityPanelViewProvider'
import { disposeSecurityDiagnostic } from './service/diagnosticsProvider'
import { RecommendationHandler } from './service/recommendationHandler'
import { Commands } from '../shared/vscode/commands2'
import { InlineCompletionService, refreshStatusBar } from './service/inlineCompletionService'
import { isInlineCompletionEnabled } from './util/commonUtil'
import { CodeWhispererCodeCoverageTracker } from './tracker/codewhispererCodeCoverageTracker'
import { AuthUtil, isUpgradeableConnection } from './util/authUtil'
import { Auth } from '../credentials/auth'
import { isUserCancelledError } from '../shared/errors'
import { showViewLogsMessage } from '../shared/utilities/messages'
import globals from '../shared/extensionGlobals'

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
                configurationChangeEvent.affectsConfiguration(
                    'aws.codeWhisperer.includeSuggestionsWithCodeReferences'
                ) ||
                configurationChangeEvent.affectsConfiguration('aws.codeWhisperer.shareCodeWhispererContentWithAWS')
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
                                vscode.env.openExternal(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
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
         * Accept terms of service
         */
        Commands.register('aws.codeWhisperer.acceptTermsOfService', async () => {
            await set(CodeWhispererConstants.autoTriggerEnabledKey, true, context.extensionContext.globalState)
            await set(CodeWhispererConstants.termsAcceptedKey, true, context.extensionContext.globalState)
            await vscode.commands.executeCommand('setContext', CodeWhispererConstants.termsAcceptedKey, true)
            await vscode.commands.executeCommand('setContext', 'CODEWHISPERER_ENABLED', true)
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
        // learn more about CodeWhisperer
        showLearnMore.register(),
        // learn more about CodeWhisperer access token migration
        showAccessTokenErrorLearnMore.register(),
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

    async function showAccessTokenMigrationDialogue() {
        // TODO: Change the color of the buttons
        const accessTokenExpired =
            context.extensionContext.globalState.get<boolean>(CodeWhispererConstants.accessTokenExpriedKey) || false

        if (AuthUtil.instance.hasAccessToken()) {
            await Auth.instance.tryAutoConnect()
            const conn = Auth.instance.activeConnection
            if (isUpgradeableConnection(conn)) {
                const didUpgrade = await AuthUtil.instance.promptUpgrade(conn, 'passive').catch(err => {
                    if (!isUserCancelledError(err)) {
                        getLogger().error('codewhisperer: failed to upgrade connection: %s', err)
                        showViewLogsMessage('Failed to upgrade current connection.')
                    }

                    return false
                })

                if (didUpgrade) {
                    return
                }
            }

            await vscode.commands.executeCommand('aws.codeWhisperer.refreshRootNode')
            const t = new Date()

            if (t <= CodeWhispererConstants.accessTokenCutOffDate) {
                maybeShowTokenMigrationWarning()
            } else {
                await globals.context.globalState.update(CodeWhispererConstants.accessToken, undefined)
                await globals.context.globalState.update(CodeWhispererConstants.accessTokenExpriedKey, true)
                await vscode.commands.executeCommand('aws.codeWhisperer.refreshRootNode')
                maybeShowTokenMigrationError()
            }
        } else if (accessTokenExpired) {
            maybeShowTokenMigrationError()
        }
    }

    function maybeShowTokenMigrationWarning() {
        const doNotShowAgain =
            context.extensionContext.globalState.get<boolean>(
                CodeWhispererConstants.accessTokenMigrationDoNotShowAgainKey
            ) || false
        const notificationLastShown: number =
            context.extensionContext.globalState.get<number | undefined>(
                CodeWhispererConstants.accessTokenMigrationDoNotShowLastShown
            ) || 1

        //Add 7 days to notificationLastShown to determine whether warn message should show
        if (doNotShowAgain || notificationLastShown + 1000 * 60 * 60 * 24 * 7 >= Date.now()) {
            return
        }

        vscode.window
            .showWarningMessage(
                CodeWhispererConstants.accessTokenMigrationWarningMessage,
                CodeWhispererConstants.accessTokenMigrationWarningButtonMessage,
                CodeWhispererConstants.accessTokenMigrationDoNotShowAgain
            )
            .then(async resp => {
                if (resp === CodeWhispererConstants.accessTokenMigrationWarningButtonMessage) {
                    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
                    await showSsoSignIn.execute()
                } else if (resp === CodeWhispererConstants.accessTokenMigrationDoNotShowAgain) {
                    await vscode.window.showInformationMessage(
                        CodeWhispererConstants.accessTokenMigrationDoNotShowAgainInfo,
                        'OK'
                    )
                    await context.extensionContext.globalState.update(
                        CodeWhispererConstants.accessTokenMigrationDoNotShowAgainKey,
                        true
                    )
                }
            })
        context.extensionContext.globalState.update(
            CodeWhispererConstants.accessTokenMigrationDoNotShowLastShown,
            Date.now()
        )
    }

    function maybeShowTokenMigrationError() {
        const migrationErrordoNotShowAgain =
            context.extensionContext.globalState.get<boolean>(
                CodeWhispererConstants.accessTokenExpiredDoNotShowAgainKey
            ) || false
        const migrationErrorLastShown: number =
            context.extensionContext.globalState.get<number | undefined>(
                CodeWhispererConstants.accessTokenExpiredDoNotShowLastShown
            ) || 1

        //Add 7 days to notificationLastShown to determine whether warn message should show
        if (migrationErrordoNotShowAgain || migrationErrorLastShown + 1000 * 60 * 60 * 24 * 7 >= Date.now()) {
            return
        }

        vscode.window
            .showErrorMessage(
                CodeWhispererConstants.accessTokenMigrationErrorMessage,
                CodeWhispererConstants.accessTokenMigrationErrorButtonMessage,
                CodeWhispererConstants.accessTokenMigrationLearnMore,
                CodeWhispererConstants.accessTokenMigrationDoNotShowAgain
            )
            .then(async resp => {
                if (resp === CodeWhispererConstants.accessTokenMigrationErrorButtonMessage) {
                    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
                    await showSsoSignIn.execute()
                } else if (resp === CodeWhispererConstants.accessTokenMigrationDoNotShowAgain) {
                    await context.extensionContext.globalState.update(
                        CodeWhispererConstants.accessTokenExpiredDoNotShowAgainKey,
                        true
                    )
                } else if (resp === CodeWhispererConstants.accessTokenMigrationLearnMore) {
                    await vscode.commands.executeCommand('aws.codeWhisperer.accessTokenErrorLearnMore')
                }
            })
        context.extensionContext.globalState.update(
            CodeWhispererConstants.accessTokenExpiredDoNotShowLastShown,
            Date.now()
        )
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
            ? context.extensionContext.asAbsolutePath(CodeWhispererConstants.welcomeCodeWhispererCloud9Readme)
            : context.extensionContext.asAbsolutePath(CodeWhispererConstants.welcomeCodeWhispererReadmeFileSource)
        const readmeUri = vscode.Uri.file(filePath)
        await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
    }

    async function getManualTriggerStatus(): Promise<boolean> {
        return context.extensionContext.globalState.get<boolean>(CodeWhispererConstants.termsAcceptedKey) || false
    }

    function getAutoTriggerStatus(): boolean {
        return context.extensionContext.globalState.get<boolean>(CodeWhispererConstants.autoTriggerEnabledKey) || false
    }

    async function getConfigEntry(): Promise<ConfigurationEntry> {
        const isShowMethodsEnabled: boolean =
            vscode.workspace.getConfiguration('editor').get('suggest.showMethods') || false
        const isAutomatedTriggerEnabled: boolean = getAutoTriggerStatus()
        const isManualTriggerEnabled: boolean = await getManualTriggerStatus()
        const isSuggestionsWithCodeReferencesEnabled = codewhispererSettings.isSuggestionsWithCodeReferencesEnabled()
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
        await vscode.commands.executeCommand('setContext', 'CODEWHISPERER_ENABLED', await getManualTriggerStatus())
    } else {
        await setSubscriptionsforVsCodeInline()
    }
    if (!isCloud9()) {
        showAccessTokenMigrationDialogue()
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

                const codeCoverageTracker = CodeWhispererCodeCoverageTracker.getTracker(e.document.languageId)
                codeCoverageTracker?.countTotalTokens(e)

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
                        vscode.window.activeTextEditor.document.languageId
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
                if (vscode.window.activeTextEditor) {
                    InlineCompletion.instance.navigateRecommendation(vscode.window.activeTextEditor, true)
                }
            }),
            Commands.register('aws.codeWhisperer.previousCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor) {
                    InlineCompletion.instance.navigateRecommendation(vscode.window.activeTextEditor, false)
                }
            }),
            /**
             * Recommendation acceptance
             */
            Commands.register('aws.codeWhisperer.acceptCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor) {
                    await InlineCompletion.instance.acceptRecommendation(vscode.window.activeTextEditor)
                }
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
        RecommendationHandler.instance.reportUserDecisionOfRecommendation(vscode.window.activeTextEditor, -1)
        RecommendationHandler.instance.clearRecommendations()
    }
    if (isInlineCompletionEnabled()) {
        await InlineCompletionService.instance.clearInlineCompletionStates(vscode.window.activeTextEditor)
    } else {
        if (vscode.window.activeTextEditor) {
            await InlineCompletion.instance.resetInlineStates(vscode.window.activeTextEditor)
        }
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
