/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as CodeWhispererConstants from './models/constants'
import {
    CodeSuggestionsState,
    CodeScansState,
    SecurityTreeViewFilterState,
    AggregatedCodeScanIssue,
    CodeScanIssue,
    CodeIssueGroupingStrategyState,
} from './models/model'
import { CodeWhispererSettings } from './util/codewhispererSettings'
import { ExtContext } from '../shared/extensions'
import { CodeWhispererTracker } from './tracker/codewhispererTracker'
import * as codewhispererClient from './client/codewhisperer'
import { getLogger } from '../shared/logger/logger'
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
    showCodeIssueGroupingQuickPick,
    selectRegionProfileCommand,
} from './commands/basicCommands'
import { ReferenceLogViewProvider } from './service/referenceLogViewProvider'
import { ReferenceHoverProvider } from './service/referenceHoverProvider'
import { ReferenceInlineProvider } from './service/referenceInlineProvider'
import {
    disposeSecurityDiagnostic,
    securityScanRender,
    updateSecurityDiagnosticCollection,
} from './service/diagnosticsProvider'
import { SecurityPanelViewProvider, openEditorAtRange } from './views/securityPanelViewProvider'
import { Commands, registerCommandErrorHandler, registerDeclaredCommands } from '../shared/vscode/commands2'
import { refreshStatusBar } from './service/statusBar'
import { AuthUtil } from './util/authUtil'
import { ImportAdderProvider } from './service/importAdderProvider'
import { openUrl } from '../shared/utilities/vsCodeUtils'
import { onProfileChangedListener } from './util/customizationUtil'
import { CodeWhispererCommandBackend, CodeWhispererCommandDeclarations } from './commands/gettingStartedPageCommands'
import { SecurityIssueHoverProvider } from './service/securityIssueHoverProvider'
import { SecurityIssueCodeActionProvider } from './service/securityIssueCodeActionProvider'
import { listCodeWhispererCommands } from './ui/statusBarMenu'
import { debounceStartSecurityScan } from './commands/startSecurityScan'
import { securityScanLanguageContext } from './util/securityScanLanguageContext'
import { registerWebviewErrorHandler } from '../webviews/server'
import { logAndShowError, logAndShowWebviewError } from '../shared/utilities/logAndShowUtils'
import { openSettings } from '../shared/settings'
import { telemetry } from '../shared/telemetry/telemetry'
import { FeatureConfigProvider } from '../shared/featureConfig'
import { SecurityIssueProvider } from './service/securityIssueProvider'
import { SecurityIssueTreeViewProvider } from './service/securityIssueTreeViewProvider'
import { setContext } from '../shared/vscode/setContext'
import { syncSecurityIssueWebview } from './views/securityIssue/securityIssueWebview'
import { detectCommentAboveLine } from '../shared/utilities/commentUtils'
import { activateEditTracking } from './nextEditPrediction/activation'

let localize: nls.LocalizeFunc

export async function activate(context: ExtContext): Promise<void> {
    localize = nls.loadMessageBundle()

    // Import old CodeWhisperer settings into Amazon Q
    await CodeWhispererSettings.instance.importSettings()

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
    context.extensionContext.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SecurityPanelViewProvider.viewType, securityPanelViewProvider)
    )

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
    ReferenceInlineProvider.instance
    ImportAdderProvider.instance

    context.extensionContext.subscriptions.push(
        // register toolkit api callback
        registerToolkitApiCallback.register(),
        signoutCodeWhisperer.register(),
        /**
         * Configuration change
         */
        vscode.workspace.onDidChangeConfiguration(async (configurationChangeEvent) => {
            if (configurationChangeEvent.affectsConfiguration('amazonQ.showCodeWithReferences')) {
                ReferenceLogViewProvider.instance.update()
                if (AuthUtil.instance.isIdcConnection()) {
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
                if (AuthUtil.instance.isIdcConnection()) {
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
                    `@id:amazonQ.showCodeWithReferences`
                )
            } else {
                await openSettings('amazonQ')
            }
        }),
        // TODO port this to lsp
        // Commands.register('aws.amazonq.refreshAnnotation', async (forceProceed: boolean) => {
        //     telemetry.record({
        //         traceId: TelemetryHelper.instance.traceId,
        //     })

        //     const editor = vscode.window.activeTextEditor
        //     if (editor) {
        //         if (forceProceed) {
        //             await container.lineAnnotationController.refresh(editor, 'codewhisperer', true)
        //         } else {
        //             await container.lineAnnotationController.refresh(editor, 'codewhisperer')
        //         }
        //     }
        // }),
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
        // quick pick code issue grouping strategy
        showCodeIssueGroupingQuickPick.register(),
        // reset security issue filters
        clearFilters.register(),
        // handle security issues tree item clicked
        focusIssue.register(),
        // refresh the treeview on every change
        SecurityTreeViewFilterState.instance.onDidChangeState((e) => {
            SecurityIssueTreeViewProvider.instance.refresh()
        }),
        // refresh treeview when grouping strategy changes
        CodeIssueGroupingStrategyState.instance.onDidChangeState((e) => {
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
        // select customization
        selectCustomizationPrompt.register(),
        // notify new customizations
        notifyNewCustomizationsCmd.register(),
        selectRegionProfileCommand.register(),

        // direct CodeWhisperer connection setup with customization
        connectWithCustomization.register(),

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
        vscode.commands.registerCommand('aws.amazonq.openEditorAtRange', openEditorAtRange),
        AuthUtil.instance.regionProfileManager.onDidChangeRegionProfile(onProfileChangedListener)
    )

    // run the auth startup code with context for telemetry
    await telemetry.function_call.run(
        async () => {
            if (AuthUtil.instance.isConnectionExpired()) {
                AuthUtil.instance.showReauthenticatePrompt().catch((e) => {
                    const defaulMsg = localize('AWS.generic.message.error', 'Failed to reauth:')
                    void logAndShowError(localize, e, 'showReauthenticatePrompt', defaulMsg)
                })
                if (AuthUtil.instance.isIdcConnection()) {
                    await AuthUtil.instance.notifySessionConfiguration()
                }
            }
        },
        { emit: false, functionId: { name: 'activateCwCore' } }
    )

    if (AuthUtil.instance.isBuilderIdConnection()) {
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
            AuthUtil.instance.isConnected() &&
            !AuthUtil.instance.isBuilderIdConnection() &&
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

    void FeatureConfigProvider.instance.fetchFeatureConfigs().catch((error) => {
        getLogger().error('Failed to fetch feature configs - %s', error)
    })

    await Commands.tryExecute('aws.amazonq.refreshConnectionCallback')

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
            }),
            vscode.window.createTreeView(SecurityIssueTreeViewProvider.viewType, {
                treeDataProvider: SecurityIssueTreeViewProvider.instance,
            })
        )
    }

    activateEditTracking(context)
}

export async function shutdown() {
    await CodeWhispererTracker.getTracker().shutdown()
    AuthUtil.instance.regionProfileManager.globalStatePoller.kill()
}

function toggleIssuesVisibility(visibleCondition: (issue: CodeScanIssue, filePath: string) => boolean) {
    const updatedIssues: AggregatedCodeScanIssue[] = SecurityIssueProvider.instance.issues.map((group) => ({
        ...group,
        issues: group.issues.map((issue) => ({ ...issue, visible: visibleCondition(issue, group.filePath) })),
    }))
    for (const issue of updatedIssues) {
        updateSecurityDiagnosticCollection(issue)
    }
    SecurityIssueProvider.instance.issues = updatedIssues
    SecurityIssueTreeViewProvider.instance.refresh()
}
