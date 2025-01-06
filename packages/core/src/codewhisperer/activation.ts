/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { getTabSizeSetting } from '../shared/utilities/editorUtilities'
import { KeyStrokeHandler } from './service/keyStrokeHandler'
import * as EditorContext from './util/editorContext'
import * as CodeWhispererConstants from './models/constants'
import { getCompletionItems } from './service/completionProvider'
import {
    vsCodeState,
    ConfigurationEntry,
    CodeSuggestionsState,
    CodeScansState,
    SecurityTreeViewFilterState,
    AggregatedCodeScanIssue,
    CodeScanIssue,
} from './models/model'
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
    openSecurityIssuePanel,
    selectCustomizationPrompt,
    notifyNewCustomizationsCmd,
    connectWithCustomization,
    applySecurityFix,
    signoutCodeWhisperer,
    toggleCodeScans,
    registerToolkitApiCallback,
    showFileScan,
    clearFilters,
    generateFix,
    explainIssue,
    ignoreIssue,
    rejectFix,
    showSecurityIssueFilters,
    regenerateFix,
    ignoreAllIssues,
    focusIssue,
    showExploreAgentsView,
} from './commands/basicCommands'
import { sleep } from '../shared/utilities/timeoutUtils'
import { ReferenceLogViewProvider } from './service/referenceLogViewProvider'
import { ReferenceHoverProvider } from './service/referenceHoverProvider'
import { ReferenceInlineProvider } from './service/referenceInlineProvider'
import {
    disposeSecurityDiagnostic,
    securityScanRender,
    updateSecurityDiagnosticCollection,
} from './service/diagnosticsProvider'
import { SecurityPanelViewProvider, openEditorAtRange } from './views/securityPanelViewProvider'
import { RecommendationHandler } from './service/recommendationHandler'
import { Commands, registerCommandErrorHandler, registerDeclaredCommands } from '../shared/vscode/commands2'
import { InlineCompletionService, refreshStatusBar } from './service/inlineCompletionService'
import { isInlineCompletionEnabled } from './util/commonUtil'
import { CodeWhispererCodeCoverageTracker } from './tracker/codewhispererCodeCoverageTracker'
import { AuthUtil } from './util/authUtil'
import { ImportAdderProvider } from './service/importAdderProvider'
import { TelemetryHelper } from './util/telemetryHelper'
import { openUrl } from '../shared/utilities/vsCodeUtils'
import { notifyNewCustomizations } from './util/customizationUtil'
import { CodeWhispererCommandBackend, CodeWhispererCommandDeclarations } from './commands/gettingStartedPageCommands'
import { SecurityIssueHoverProvider } from './service/securityIssueHoverProvider'
import { SecurityIssueCodeActionProvider } from './service/securityIssueCodeActionProvider'
import { listCodeWhispererCommands } from './ui/statusBarMenu'
import { updateUserProxyUrl } from './client/agent'
import { Container } from './service/serviceContainer'
import { debounceStartSecurityScan } from './commands/startSecurityScan'
import { securityScanLanguageContext } from './util/securityScanLanguageContext'
import { registerWebviewErrorHandler } from '../webviews/server'
import { logAndShowError, logAndShowWebviewError } from '../shared/utilities/logAndShowUtils'
import { openSettings } from '../shared/settings'
import { telemetry } from '../shared/telemetry'
import { FeatureConfigProvider } from '../shared/featureConfig'
import { SecurityIssueProvider } from './service/securityIssueProvider'
import { SecurityIssueTreeViewProvider } from './service/securityIssueTreeViewProvider'
import { setContext } from '../shared/vscode/setContext'
import { syncSecurityIssueWebview } from './views/securityIssue/securityIssueWebview'
import { detectCommentAboveLine } from '../shared/utilities/commentUtils'

let localize: nls.LocalizeFunc

export async function activate(context: ExtContext): Promise<void> {
    localize = nls.loadMessageBundle()
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

    // TODO: is this indirection useful?
    registerDeclaredCommands(
        context.extensionContext.subscriptions,
        CodeWhispererCommandDeclarations.instance,
        new CodeWhispererCommandBackend(context.extensionContext)
    )

    /**
     * CodeWhisperer security panel
     */
    const securityPanelViewProvider = new SecurityPanelViewProvider(context.extensionContext)
    activateSecurityScan()

    // TODO: this is already done in packages/core/src/extensionCommon.ts, why doesn't amazonq use that?
    registerCommandErrorHandler((info, error) => {
        const defaultMessage = localize('AWS.generic.message.error', 'Failed to run command: {0}', info.id)
        void logAndShowError(localize, error, info.id, defaultMessage)
    })

    // TODO: this is already done in packages/core/src/extensionCommon.ts, why doesn't amazonq use that?
    registerWebviewErrorHandler((error: unknown, webviewId: string, command: string) => {
        return logAndShowWebviewError(localize, error, webviewId, command)
    })

    /**
     * Service control
     */
    const client = new codewhispererClient.DefaultCodeWhispererClient()

    // Service initialization
    const container = Container.instance
    ReferenceInlineProvider.instance
    ImportAdderProvider.instance

    context.extensionContext.subscriptions.push(
        // register toolkit api callback
        registerToolkitApiCallback.register(),
        signoutCodeWhisperer.register(auth),
        /**
         * Configuration change
         */
        vscode.workspace.onDidChangeConfiguration(async (configurationChangeEvent) => {
            if (configurationChangeEvent.affectsConfiguration('editor.tabSize')) {
                EditorContext.updateTabSize(getTabSizeSetting())
            }

            if (configurationChangeEvent.affectsConfiguration('amazonQ.showInlineCodeSuggestionsWithCodeReferences')) {
                ReferenceLogViewProvider.instance.update()
                if (auth.isEnterpriseSsoInUse()) {
                    await vscode.window
                        .showInformationMessage(
                            CodeWhispererConstants.ssoConfigAlertMessage,
                            CodeWhispererConstants.settingsLearnMore
                        )
                        .then(async (resp) => {
                            if (resp === CodeWhispererConstants.settingsLearnMore) {
                                void openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
                            }
                        })
                }
            }

            if (configurationChangeEvent.affectsConfiguration('amazonQ.shareContentWithAWS')) {
                if (auth.isEnterpriseSsoInUse()) {
                    await vscode.window
                        .showInformationMessage(
                            CodeWhispererConstants.ssoConfigAlertMessageShareData,
                            CodeWhispererConstants.settingsLearnMore
                        )
                        .then(async (resp) => {
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
                    .then((selected) => {
                        if (selected === CodeWhispererConstants.reloadWindow) {
                            void vscode.commands.executeCommand('workbench.action.reloadWindow')
                        }
                    })
            }

            if (configurationChangeEvent.affectsConfiguration('http.proxy')) {
                updateUserProxyUrl()
            }

            if (configurationChangeEvent.affectsConfiguration('amazonQ.ignoredSecurityIssues')) {
                const ignoredIssues = CodeWhispererSettings.instance.getIgnoredSecurityIssues()
                toggleIssuesVisibility((issue) => !ignoredIssues.includes(issue.title))
            }
        }),
        /**
         * Open Configuration
         */
        Commands.register('aws.amazonq.configure', async (id) => {
            if (id === 'codewhisperer') {
                await vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    `@id:amazonQ.showInlineCodeSuggestionsWithCodeReferences`
                )
            } else {
                await openSettings('amazonQ')
            }
        }),
        Commands.register('aws.amazonq.refreshAnnotation', async (forceProceed: boolean) => {
            telemetry.record({
                traceId: TelemetryHelper.instance.traceId,
            })

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
        // toggle code suggestions
        toggleCodeSuggestions.register(CodeSuggestionsState.instance),
        // toggle code scans
        toggleCodeScans.register(CodeScansState.instance),
        // enable code suggestions
        enableCodeSuggestions.register(context),
        // project scan
        showSecurityScan.register(context, securityPanelViewProvider, client),
        // on demand file scan
        showFileScan.register(context, securityPanelViewProvider, client),
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
        // generate code fix
        generateFix.register(client, context),
        // regenerate code fix
        regenerateFix.register(),
        // apply suggested fix
        applySecurityFix.register(),
        // reject suggested fix
        rejectFix.register(context.extensionContext),
        // ignore issues by title
        ignoreAllIssues.register(),
        // ignore single issue
        ignoreIssue.register(),
        // explain issue
        explainIssue.register(),
        // quick pick with codewhisperer options
        listCodeWhispererCommands.register(),
        // quick pick with security issues tree filters
        showSecurityIssueFilters.register(),
        // reset security issue filters
        clearFilters.register(),
        // handle security issues tree item clicked
        focusIssue.register(),
        // refresh the treeview on every change
        SecurityTreeViewFilterState.instance.onDidChangeState((e) => {
            SecurityIssueTreeViewProvider.instance.refresh()
        }),
        // show a no match state
        SecurityIssueTreeViewProvider.instance.onDidChangeTreeData((e) => {
            const noMatches =
                Array.isArray(e) &&
                e.length === 0 &&
                SecurityIssueProvider.instance.issues.some((group) => group.issues.some((issue) => issue.visible))
            void setContext('aws.amazonq.security.noMatches', noMatches)
        }),
        // manual trigger
        Commands.register({ id: 'aws.amazonq.invokeInlineCompletion', autoconnect: true }, async () => {
            invokeRecommendation(
                vscode.window.activeTextEditor as vscode.TextEditor,
                client,
                await getConfigEntry()
            ).catch((e) => {
                getLogger().error('invokeRecommendation failed: %s', (e as Error).message)
            })
        }),
        // select customization
        selectCustomizationPrompt.register(),
        // notify new customizations
        notifyNewCustomizationsCmd.register(),
        /**
         * On recommendation acceptance
         */
        acceptSuggestion.register(context),

        // direct CodeWhisperer connection setup with customization
        connectWithCustomization.register(),

        // on text document close.
        vscode.workspace.onDidCloseTextDocument((e) => {
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
        showExploreAgentsView.register(),
        vscode.languages.registerCodeLensProvider(
            [...CodeWhispererConstants.platformLanguageIds],
            ReferenceInlineProvider.instance
        ),
        vscode.languages.registerCodeLensProvider(
            [...CodeWhispererConstants.platformLanguageIds, { scheme: 'untitled' }],
            ImportAdderProvider.instance
        ),
        vscode.languages.registerHoverProvider(
            [...CodeWhispererConstants.securityScanLanguageIds],
            SecurityIssueHoverProvider.instance
        ),
        vscode.languages.registerCodeActionsProvider(
            [...CodeWhispererConstants.securityScanLanguageIds],
            SecurityIssueCodeActionProvider.instance
        ),
        vscode.commands.registerCommand('aws.amazonq.openEditorAtRange', openEditorAtRange)
    )

    // run the auth startup code with context for telemetry
    await telemetry.function_call.run(
        async () => {
            await auth.restore()
            await auth.clearExtraConnections()

            if (auth.isConnectionExpired()) {
                auth.showReauthenticatePrompt().catch((e) => {
                    const defaulMsg = localize('AWS.generic.message.error', 'Failed to reauth:')
                    void logAndShowError(localize, e, 'showReauthenticatePrompt', defaulMsg)
                })
                if (auth.isEnterpriseSsoInUse()) {
                    await auth.notifySessionConfiguration()
                }
            }
        },
        { emit: false, functionId: { name: 'activateCwCore' } }
    )

    if (auth.isValidEnterpriseSsoInUse()) {
        await notifyNewCustomizations()
    }
    if (auth.isBuilderIdInUse()) {
        await CodeScansState.instance.setScansEnabled(false)
    }

    /**
     * CodeWhisperer auto scans
     */
    setSubscriptionsForAutoScans()

    setSubscriptionsForCodeIssues()

    function shouldRunAutoScan(editor: vscode.TextEditor | undefined, isScansEnabled?: boolean) {
        return (
            (isScansEnabled ?? CodeScansState.instance.isScansEnabled()) &&
            !CodeScansState.instance.isMonthlyQuotaExceeded() &&
            auth.isConnectionValid() &&
            !auth.isBuilderIdInUse() &&
            editor &&
            editor.document.uri.scheme === 'file' &&
            securityScanLanguageContext.isLanguageSupported(editor.document.languageId)
        )
    }

    function setSubscriptionsForAutoScans() {
        // Initial scan when the editor opens for the first time
        const editor = vscode.window.activeTextEditor
        if (editor && shouldRunAutoScan(editor) && editor.document.getText().length > 0) {
            void debounceStartSecurityScan(
                securityPanelViewProvider,
                editor,
                client,
                context.extensionContext,
                CodeWhispererConstants.CodeAnalysisScope.FILE_AUTO,
                false
            )
        }

        context.extensionContext.subscriptions.push(
            // Trigger scan if focus switches to a different file
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                const codewhispererDiagnostics = editor
                    ? securityScanRender.securityDiagnosticCollection
                          ?.get(editor.document.uri)
                          ?.filter(({ source }) => source === CodeWhispererConstants.codewhispererDiagnosticSourceLabel)
                    : undefined

                if (
                    editor &&
                    shouldRunAutoScan(editor) &&
                    editor.document.getText().length > 0 &&
                    (!codewhispererDiagnostics || codewhispererDiagnostics?.length === 0)
                ) {
                    void debounceStartSecurityScan(
                        securityPanelViewProvider,
                        editor,
                        client,
                        context.extensionContext,
                        CodeWhispererConstants.CodeAnalysisScope.FILE_AUTO,
                        false
                    )
                }
            }),
            // Trigger scan if the file contents change
            vscode.workspace.onDidChangeTextDocument(async (event) => {
                const editor = vscode.window.activeTextEditor
                if (
                    editor &&
                    shouldRunAutoScan(editor) &&
                    event.document === editor.document &&
                    event.contentChanges.length > 0
                ) {
                    void debounceStartSecurityScan(
                        securityPanelViewProvider,
                        editor,
                        client,
                        context.extensionContext,
                        CodeWhispererConstants.CodeAnalysisScope.FILE_AUTO,
                        false
                    )
                }
            })
        )

        // Trigger scan if the toggle has just been enabled
        CodeScansState.instance.onDidChangeState((isScansEnabled) => {
            const editor = vscode.window.activeTextEditor
            if (editor && shouldRunAutoScan(editor, isScansEnabled) && editor.document.getText().length > 0) {
                void debounceStartSecurityScan(
                    securityPanelViewProvider,
                    editor,
                    client,
                    context.extensionContext,
                    CodeWhispererConstants.CodeAnalysisScope.FILE_AUTO,
                    false
                )
            }
        })
    }

    function activateSecurityScan() {
        context.extensionContext.subscriptions.push(
            vscode.window.registerWebviewViewProvider(SecurityPanelViewProvider.viewType, securityPanelViewProvider)
        )

        context.extensionContext.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
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
        RecommendationHandler.instance.subscribeSuggestionCommands()
        /**
         * Automated trigger
         */
        context.extensionContext.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(async (editor) => {
                await RecommendationHandler.instance.onEditorChange()
            }),
            vscode.window.onDidChangeWindowState(async (e) => {
                await RecommendationHandler.instance.onFocusChange()
            }),
            vscode.window.onDidChangeTextEditorSelection(async (e) => {
                await RecommendationHandler.instance.onCursorChange(e)
            }),
            vscode.workspace.onDidChangeTextDocument(async (e) => {
                const editor = vscode.window.activeTextEditor
                if (!editor) {
                    return
                }
                if (e.document !== editor.document) {
                    return
                }
                if (!runtimeLanguageContext.isLanguageSupported(e.document)) {
                    return
                }

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
            vscode.workspace.onDidChangeTextDocument(async (e) => {
                const editor = vscode.window.activeTextEditor
                if (!editor) {
                    return
                }
                if (e.document !== editor.document) {
                    return
                }
                if (!runtimeLanguageContext.isLanguageSupported(e.document)) {
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
            vscode.window.onDidChangeVisibleTextEditors(async (e) => {
                resetIntelliSenseState(true, getAutoTriggerStatus(), RecommendationHandler.instance.isValidResponse())
            }),
            vscode.window.onDidChangeActiveTextEditor(async (e) => {
                resetIntelliSenseState(true, getAutoTriggerStatus(), RecommendationHandler.instance.isValidResponse())
            }),
            vscode.window.onDidChangeTextEditorSelection(async (e) => {
                if (e.kind === TextEditorSelectionChangeKind.Mouse) {
                    resetIntelliSenseState(
                        true,
                        getAutoTriggerStatus(),
                        RecommendationHandler.instance.isValidResponse()
                    )
                }
            }),
            vscode.workspace.onDidSaveTextDocument(async (e) => {
                resetIntelliSenseState(true, getAutoTriggerStatus(), RecommendationHandler.instance.isValidResponse())
            })
        )
    }

    void FeatureConfigProvider.instance.fetchFeatureConfigs().catch((error) => {
        getLogger().error('Failed to fetch feature configs - %s', error)
    })

    await Commands.tryExecute('aws.amazonq.refreshConnectionCallback')
    container.ready()

    function setSubscriptionsForCodeIssues() {
        context.extensionContext.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(async (e) => {
                if (e.document.uri.scheme !== 'file') {
                    return
                }
                const diagnostics = securityScanRender.securityDiagnosticCollection?.get(e.document.uri)
                if (!diagnostics || diagnostics.length === 0) {
                    return
                }
                disposeSecurityDiagnostic(e)

                SecurityIssueProvider.instance.handleDocumentChange(e)
                SecurityIssueTreeViewProvider.instance.refresh()
                await syncSecurityIssueWebview(context)

                toggleIssuesVisibility((issue, filePath) =>
                    filePath !== e.document.uri.fsPath
                        ? issue.visible
                        : !detectCommentAboveLine(
                              e.document,
                              issue.startLine,
                              CodeWhispererConstants.amazonqIgnoreNextLine
                          )
                )
            })
        )
    }
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
        getLogger().error('amazonq: Failed to update user settings %O', error)
    }
}

function toggleIssuesVisibility(visibleCondition: (issue: CodeScanIssue, filePath: string) => boolean) {
    const updatedIssues: AggregatedCodeScanIssue[] = SecurityIssueProvider.instance.issues.map((group) => ({
        ...group,
        issues: group.issues.map((issue) => ({ ...issue, visible: visibleCondition(issue, group.filePath) })),
    }))
    securityScanRender.securityDiagnosticCollection?.clear()
    for (const issue of updatedIssues) {
        updateSecurityDiagnosticCollection(issue)
    }
    SecurityIssueProvider.instance.issues = updatedIssues
    SecurityIssueTreeViewProvider.instance.refresh()
}
