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
import { vsCodeState, ConfigurationEntry, CodeSuggestionsState } from './models/model'
import { invokeRecommendation } from './commands/invokeRecommendation'
import { acceptSuggestion } from './commands/onInlineAcceptance'
import { resetIntelliSenseState } from './util/globalStateUtil'
import { CodeWhispererSettings } from './util/codewhispererSettings'
import { ExtContext, VSCODE_EXTENSION_ID } from '../shared/extensions'
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
    openSecurityIssuePanel,
    selectCustomizationPrompt,
    notifyNewCustomizationsCmd,
    connectWithCustomization,
    applySecurityFix,
    signoutCodeWhisperer,
    showManageCwConnections,
    fetchFeatureConfigsCmd,
} from './commands/basicCommands'
import { sleep } from '../shared/utilities/timeoutUtils'
import { ReferenceLogViewProvider } from './service/referenceLogViewProvider'
import { ReferenceHoverProvider } from './service/referenceHoverProvider'
import { ReferenceInlineProvider } from './service/referenceInlineProvider'
import { SecurityPanelViewProvider } from './views/securityPanelViewProvider'
import { disposeSecurityDiagnostic } from './service/diagnosticsProvider'
import { RecommendationHandler } from './service/recommendationHandler'
import { Commands, registerCommandsWithVSCode } from '../shared/vscode/commands2'
import { InlineCompletionService, refreshStatusBar } from './service/inlineCompletionService'
import { isInlineCompletionEnabled } from './util/commonUtil'
import { CodeWhispererCodeCoverageTracker } from './tracker/codewhispererCodeCoverageTracker'
import { AuthUtil, getChatAuthState } from './util/authUtil'
import { ImportAdderProvider } from './service/importAdderProvider'
import { TelemetryHelper } from './util/telemetryHelper'
import { activateExtension, isExtensionInstalled, openUrl } from '../shared/utilities/vsCodeUtils'
import { notifyNewCustomizations } from './util/customizationUtil'
import { CodeWhispererCommandBackend, CodeWhispererCommandDeclarations } from './commands/gettingStartedPageCommands'
import { SecurityIssueHoverProvider } from './service/securityIssueHoverProvider'
import { SecurityIssueCodeActionProvider } from './service/securityIssueCodeActionProvider'
import { listCodeWhispererCommands } from './ui/statusBarMenu'
import { updateUserProxyUrl } from './client/agent'
import { Container } from './service/serviceContainer'
import { AwsConnection } from '../auth/connection'
const performance = globalThis.performance ?? require('perf_hooks').performance

export async function activate(context: ExtContext): Promise<void> {
    const codewhispererSettings = CodeWhispererSettings.instance
    // initialize AuthUtil earlier to make sure it can listen to connection change events.
    const auth = AuthUtil.instance
    auth.initCodeWhispererHooks()

    /**
     * Enable essential intellisense default settings for AWS C9 IDE
     */

    if (isCloud9()) {
        await enableDefaultConfigCloud9()
    }

    registerCommandsWithVSCode(
        context.extensionContext,
        CodeWhispererCommandDeclarations.instance,
        new CodeWhispererCommandBackend(context.extensionContext)
    )

    /**
     * CodeWhisperer security panel
     */
    const securityPanelViewProvider = new SecurityPanelViewProvider(context.extensionContext)
    activateSecurityScan()

    /**
     * Service control
     */
    const client = new codewhispererClient.DefaultCodeWhispererClient()

    // Service initialization
    const container = Container.instance
    ReferenceInlineProvider.instance
    ImportAdderProvider.instance

    context.extensionContext.subscriptions.push(
        signoutCodeWhisperer.register(auth),
        showManageCwConnections.register(),
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
                                void openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
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
                                void openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
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
                            void vscode.commands.executeCommand('workbench.action.reloadWindow')
                        }
                    })
            }

            if (configurationChangeEvent.affectsConfiguration('http.proxy')) {
                updateUserProxyUrl()
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
        Commands.register('aws.codewhisperer.refreshAnnotation', async (forceProceed: boolean = false) => {
            const editor = vscode.window.activeTextEditor
            if (editor) {
                if (forceProceed) {
                    await container.lineAnnotationController.refresh(editor, 'codewhisperer', true)
                } else {
                    await container.lineAnnotationController.refresh(editor, 'codewhisperer')
                }
            }
        }),
        // show introduction
        showIntroduction.register(),
        // direct CodeWhisperer connection setup with customization
        connectWithCustomization.register(),
        // toggle code suggestions
        toggleCodeSuggestions.register(CodeSuggestionsState.instance),
        // enable code suggestions
        enableCodeSuggestions.register(context),
        // code scan
        showSecurityScan.register(context, securityPanelViewProvider, client),
        // show security issue webview panel
        openSecurityIssuePanel.register(context),
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
        // apply suggested fix
        applySecurityFix.register(),
        // quick pick with codewhisperer options
        listCodeWhispererCommands.register(),
        // manual trigger
        Commands.register({ id: 'aws.codeWhisperer', autoconnect: true }, async () => {
            invokeRecommendation(
                vscode.window.activeTextEditor as vscode.TextEditor,
                client,
                await getConfigEntry()
            ).catch(e => {
                getLogger().error('invokeRecommendation failed: %s', (e as Error).message)
            })
        }),
        // select customization
        selectCustomizationPrompt.register(),
        // notify new customizations
        notifyNewCustomizationsCmd.register(),
        // fetch feature configs
        fetchFeatureConfigsCmd.register(),
        /**
         * On recommendation acceptance
         */
        acceptSuggestion.register(context),
        // on text document close.
        vscode.workspace.onDidCloseTextDocument(e => {
            if (isInlineCompletionEnabled() && e.uri.fsPath !== InlineCompletionService.instance.filePath()) {
                return
            }
            RecommendationHandler.instance.reportUserDecisions(-1)
        }),

        vscode.languages.registerHoverProvider(
            [...CodeWhispererConstants.platformLanguageIds],
            ReferenceHoverProvider.instance
        ),
        vscode.window.registerWebviewViewProvider(ReferenceLogViewProvider.viewType, ReferenceLogViewProvider.instance),
        showReferenceLog.register(),
        vscode.languages.registerCodeLensProvider(
            [...CodeWhispererConstants.platformLanguageIds],
            ReferenceInlineProvider.instance
        ),
        vscode.languages.registerCodeLensProvider(
            [...CodeWhispererConstants.platformLanguageIds, { scheme: 'untitled' }],
            ImportAdderProvider.instance
        ),
        vscode.languages.registerHoverProvider(
            [...CodeWhispererConstants.platformLanguageIds],
            SecurityIssueHoverProvider.instance
        ),
        vscode.languages.registerCodeActionsProvider(
            [...CodeWhispererConstants.platformLanguageIds],
            SecurityIssueCodeActionProvider.instance
        )
    )

    await auth.restore()

    // While the Q/CW exposes an API for the Toolkit to register callbacks on auth changes,
    // we need to do it manually here because the Toolkit would have been unable to call
    // this API if the Q/CW extension started afterwards (and this code block is running).
    if (isExtensionInstalled(VSCODE_EXTENSION_ID.awstoolkit)) {
        await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
        const toolkitExt = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)
        const toolkitApi = toolkitExt?.exports

        auth.auth.onDidChangeActiveConnection(async () => {
            await vscode.commands.executeCommand(
                '_aws.toolkit.auth.restore',
                (
                    await getChatAuthState()
                ).codewhispererChat
            )
        })
        auth.auth.onDidChangeConnectionState(async e => {
            await vscode.commands.executeCommand(
                '_aws.toolkit.auth.restore',
                (
                    await getChatAuthState()
                ).codewhispererChat
            )
            // when changing connection state in Q, also change connection state in toolkit
            if (toolkitApi && 'updateConnection' in toolkitApi) {
                const id = e.id
                const conn = await auth.auth.getConnection({ id })
                if (conn && conn.type === 'sso') {
                    getLogger().info(`tookitApi update connection ${id}`)
                    await toolkitApi.updateConnection({
                        type: conn.type,
                        ssoRegion: conn.ssoRegion,
                        scopes: conn.scopes,
                        startUrl: conn.startUrl,
                        state: e.state,
                        id: id,
                        label: conn.label,
                    } as AwsConnection)
                }
            }
        })
        // when deleting connection in Q, also delete same connection in toolkit
        auth.auth.onDidDeleteConnection(async id => {
            if (toolkitApi && 'deleteConnection' in toolkitApi) {
                getLogger().info(`tookitApi delete connection ${id}`)
                await toolkitApi.deleteConnection(id)
            }
        })

        // when toolkit connection changes
        if (toolkitApi && 'onDidChangeConnection' in toolkitApi) {
            toolkitApi.onDidChangeConnection(
                async (connection: AwsConnection) => {
                    getLogger().info(`tookitApi toolkit connection change callback ${connection.id}`)
                    await auth.auth.updateConnectionCallback(connection)
                },

                async (id: string) => {
                    getLogger().info(`tookitApi toolkit connection delete callback ${id}`)
                    await auth.auth.deletionConnectionCallback(id)
                }
            )
        }
    }

    if (auth.isConnectionExpired()) {
        auth.showReauthenticatePrompt().catch(e => {
            getLogger().error('showReauthenticatePrompt failed: %s', (e as Error).message)
        })
    }
    if (auth.isValidEnterpriseSsoInUse()) {
        await notifyNewCustomizations()
    }

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
        return CodeSuggestionsState.instance.isSuggestionsEnabled()
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
        await AuthUtil.instance.setVscodeContextProps()
    }

    async function setSubscriptionsforInlineCompletion() {
        /**
         * Automated trigger
         */
        context.extensionContext.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(async editor => {
                await RecommendationHandler.instance.onEditorChange()
            }),
            vscode.window.onDidChangeWindowState(async e => {
                await RecommendationHandler.instance.onFocusChange()
            }),
            vscode.window.onDidChangeTextEditorSelection(async e => {
                await RecommendationHandler.instance.onCursorChange(e)
            }),
            vscode.workspace.onDidChangeTextDocument(async e => {
                const editor = vscode.window.activeTextEditor
                if (!editor) {
                    return
                }
                if (e.document !== editor.document) {
                    return
                }
                if (!runtimeLanguageContext.isLanguageSupported(e.document.languageId)) {
                    return
                }

                /**
                 * CodeWhisperer security panel dynamic handling
                 */
                disposeSecurityDiagnostic(e)

                SecurityIssueHoverProvider.instance.handleDocumentChange(e)
                SecurityIssueCodeActionProvider.instance.handleDocumentChange(e)

                CodeWhispererCodeCoverageTracker.getTracker(e.document.languageId)?.countTotalTokens(e)

                /**
                 * Handle this keystroke event only when
                 * 1. It is not a backspace
                 * 2. It is not caused by CodeWhisperer editing
                 * 3. It is not from undo/redo.
                 */
                if (e.contentChanges.length === 0 || vsCodeState.isCodeWhispererEditing) {
                    return
                }

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
                if (!RecommendationHandler.instance.isSuggestionVisible()) {
                    await KeyStrokeHandler.instance.processKeyStroke(e, editor, client, await getConfigEntry())
                }
            })
        )
    }

    function setSubscriptionsforCloud9() {
        /**
         * Manual trigger
         */
        context.extensionContext.subscriptions.push(
            vscode.languages.registerCompletionItemProvider([...CodeWhispererConstants.platformLanguageIds], {
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
                const editor = vscode.window.activeTextEditor
                if (!editor) {
                    return
                }
                if (e.document !== editor.document) {
                    return
                }
                if (!runtimeLanguageContext.isLanguageSupported(e.document.languageId)) {
                    return
                }
                /**
                 * CodeWhisperer security panel dynamic handling
                 */
                securityPanelViewProvider.disposeSecurityPanelItem(e, editor)
                CodeWhispererCodeCoverageTracker.getTracker(e.document.languageId)?.countTotalTokens(e)

                if (e.contentChanges.length === 0 || vsCodeState.isCodeWhispererEditing) {
                    return
                }
                /**
                 * Important:  Doing this sleep(10) is to make sure
                 * 1. this event is processed by vs code first
                 * 2. editor.selection.active has been successfully updated by VS Code
                 * Then this event can be processed by our code.
                 */
                await sleep(CodeWhispererConstants.vsCodeCursorUpdateDelay)
                await KeyStrokeHandler.instance.processKeyStroke(e, editor, client, await getConfigEntry())
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

    container.ready()
}

export async function shutdown() {
    RecommendationHandler.instance.reportUserDecisions(-1)
    await CodeWhispererTracker.getTracker().shutdown()
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
