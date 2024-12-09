/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CodewhispererCodeScanIssueApplyFix, Component, telemetry } from '../../shared/telemetry/telemetry'
import { ExtContext, VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { Commands, VsCodeCommandArg, placeholder } from '../../shared/vscode/commands2'
import * as CodeWhispererConstants from '../models/constants'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { confirmStopSecurityScan, startSecurityScan } from './startSecurityScan'
import { SecurityPanelViewProvider } from '../views/securityPanelViewProvider'
import {
    codeFixState,
    CodeScanIssue,
    CodeScansState,
    codeScanState,
    CodeSuggestionsState,
    onDemandFileScanState,
    SecurityIssueFilters,
    SecurityTreeViewFilterState,
    severities,
    vsCodeState,
} from '../models/model'
import { connectToEnterpriseSso, getStartUrl } from '../util/getStartUrl'
import { showCodeWhispererConnectionPrompt } from '../util/showSsoPrompt'
import { ReferenceLogViewProvider } from '../service/referenceLogViewProvider'
import { AuthUtil } from '../util/authUtil'
import { isCloud9 } from '../../shared/extensionUtilities'
import { getLogger } from '../../shared/logger'
import { isExtensionActive, isExtensionInstalled, localize, openUrl } from '../../shared/utilities/vsCodeUtils'
import {
    getPersistedCustomizations,
    notifyNewCustomizations,
    selectCustomization,
    showCustomizationPrompt,
} from '../util/customizationUtil'
import {
    closeSecurityIssueWebview,
    isSecurityIssueWebviewOpen,
    showSecurityIssueWebview,
    updateSecurityIssueWebview,
} from '../views/securityIssue/securityIssueWebview'
import { Mutable } from '../../shared/utilities/tsUtils'
import { CodeWhispererSource } from './types'
import { TelemetryHelper } from '../util/telemetryHelper'
import { Auth, AwsConnection } from '../../auth'
import { once } from '../../shared/utilities/functionUtils'
import { focusAmazonQPanel } from '../../codewhispererChat/commands/registerCommands'
import { removeDiagnostic } from '../service/diagnosticsProvider'
import { SsoAccessTokenProvider } from '../../auth/sso/ssoAccessTokenProvider'
import { ToolkitError, getTelemetryReason, getTelemetryReasonDesc } from '../../shared/errors'
import { isRemoteWorkspace } from '../../shared/vscode/env'
import { isBuilderIdConnection } from '../../auth/connection'
import globals from '../../shared/extensionGlobals'
import { getVscodeCliPath } from '../../shared/utilities/pathFind'
import { setContext } from '../../shared/vscode/setContext'
import { tryRun } from '../../shared/utilities/pathFind'
import { IssueItem, SecurityIssueTreeViewProvider } from '../service/securityIssueTreeViewProvider'
import { SecurityIssueProvider } from '../service/securityIssueProvider'
import { CodeWhispererSettings } from '../util/codewhispererSettings'
import { closeDiff, getPatchedCode } from '../../shared/utilities/diffUtils'
import { insertCommentAboveLine } from '../../shared/utilities/commentUtils'
import { cancel, confirm } from '../../shared'
import { startCodeFixGeneration } from './startCodeFixGeneration'
import { DefaultAmazonQAppInitContext } from '../../amazonq/apps/initContext'
import path from 'path'

const MessageTimeOut = 5_000

export const toggleCodeSuggestions = Commands.declare(
    { id: 'aws.amazonq.toggleCodeSuggestion', compositeKey: { 1: 'source' } },
    (suggestionState: CodeSuggestionsState) => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        await telemetry.aws_modifySetting.run(async (span) => {
            span.record({
                settingId: CodeWhispererConstants.autoSuggestionConfig.settingId,
            })

            const isSuggestionsEnabled = await suggestionState.toggleSuggestions()

            span.record({
                settingState: isSuggestionsEnabled
                    ? CodeWhispererConstants.autoSuggestionConfig.activated
                    : CodeWhispererConstants.autoSuggestionConfig.deactivated,
            })
            vsCodeState.isFreeTierLimitReached = false

            void vscode.window.setStatusBarMessage(
                isSuggestionsEnabled
                    ? 'Amazon Q: Auto-Suggestions are currently running.'
                    : 'Amazon Q: Auto-Suggestions are currently paused.',
                MessageTimeOut
            )
        })
    }
)

export const enableCodeSuggestions = Commands.declare(
    'aws.amazonq.enableCodeSuggestions',
    (context: ExtContext) =>
        async (isAuto: boolean = true) => {
            await CodeSuggestionsState.instance.setSuggestionsEnabled(isAuto)
            await setContext('aws.codewhisperer.connected', true)
            await setContext('aws.codewhisperer.connectionExpired', false)
            vsCodeState.isFreeTierLimitReached = false
            if (!isCloud9()) {
                await vscode.commands.executeCommand('aws.amazonq.refreshStatusBar')
            }
        }
)

export const toggleCodeScans = Commands.declare(
    { id: 'aws.codeWhisperer.toggleCodeScan', compositeKey: { 1: 'source' } },
    (scansState: CodeScansState) => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        await telemetry.aws_modifySetting.run(async (span) => {
            if (isBuilderIdConnection(AuthUtil.instance.conn)) {
                throw new Error(`Auto-scans are not supported with the Amazon Builder ID connection.`)
            }
            span.record({
                settingId: CodeWhispererConstants.autoScansConfig.settingId,
            })

            const isScansEnabled = await scansState.toggleScans()
            span.record({
                settingState: isScansEnabled
                    ? CodeWhispererConstants.autoScansConfig.activated
                    : CodeWhispererConstants.autoScansConfig.deactivated,
            })

            await vscode.commands.executeCommand('aws.amazonq.refreshStatusBar')
            void vscode.window.setStatusBarMessage(
                isScansEnabled
                    ? 'Amazon Q: Auto-Scans are currently running.'
                    : 'Amazon Q: Auto-Scans are currently paused.',
                MessageTimeOut
            )
        })
    }
)

export const showReferenceLog = Commands.declare(
    { id: 'aws.amazonq.openReferencePanel', compositeKey: { 1: 'source' } },
    () => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        if (_ !== placeholder) {
            source = 'ellipsesMenu'
        }
        await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-reference-log')
    }
)

export const showExploreAgentsView = Commands.declare(
    { id: 'aws.amazonq.exploreAgents', compositeKey: { 1: 'source' } },
    () => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        if (_ !== placeholder) {
            source = 'ellipsesMenu'
        }

        DefaultAmazonQAppInitContext.instance.getAppsToWebViewMessagePublisher().publish({
            sender: 'amazonqCore',
            command: 'showExploreAgentsView',
        })
    }
)

export const showIntroduction = Commands.declare('aws.amazonq.introduction', () => async () => {
    void openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUriGeneral))
})

export const showSecurityScan = Commands.declare(
    { id: 'aws.amazonq.security.scan', compositeKey: { 1: 'source' } },
    (context: ExtContext, securityPanelViewProvider: SecurityPanelViewProvider, client: DefaultCodeWhispererClient) =>
        async (_: VsCodeCommandArg, source: CodeWhispererSource, initiatedByChat: boolean, scanUuid?: string) => {
            if (AuthUtil.instance.isConnectionExpired()) {
                await AuthUtil.instance.notifyReauthenticate()
            }
            if (codeScanState.isNotStarted()) {
                // User intends to start as "Start Security Scan" is shown in the explorer tree
                codeScanState.setToRunning()
                void startSecurityScan(
                    securityPanelViewProvider,
                    undefined,
                    client,
                    context.extensionContext,
                    CodeWhispererConstants.CodeAnalysisScope.PROJECT,
                    initiatedByChat,
                    undefined,
                    scanUuid
                )
            } else if (codeScanState.isRunning()) {
                // User intends to stop as "Stop Security Scan" is shown in the explorer tree
                // Cancel only when the code scan state is "Running"
                await confirmStopSecurityScan(
                    codeScanState,
                    initiatedByChat,
                    CodeWhispererConstants.CodeAnalysisScope.PROJECT,
                    undefined
                )
            }
            vsCodeState.isFreeTierLimitReached = false
        }
)

export const showFileScan = Commands.declare(
    { id: 'aws.amazonq.security.filescan', compositeKey: { 1: 'source' } },
    (context: ExtContext, securityPanelViewProvider: SecurityPanelViewProvider, client: DefaultCodeWhispererClient) =>
        async (_: VsCodeCommandArg, source: CodeWhispererSource, scanUuid?: string) => {
            if (AuthUtil.instance.isConnectionExpired()) {
                await AuthUtil.instance.notifyReauthenticate()
            }
            const editor = vscode.window.activeTextEditor
            if (onDemandFileScanState.isNotStarted()) {
                onDemandFileScanState.setToRunning()
                void startSecurityScan(
                    securityPanelViewProvider,
                    editor,
                    client,
                    context.extensionContext,
                    CodeWhispererConstants.CodeAnalysisScope.FILE_ON_DEMAND,
                    true,
                    undefined,
                    scanUuid
                )
            } else if (onDemandFileScanState.isRunning()) {
                // TODO: Pending with progress bar implementation in the Q chat Panel
                // User intends to stop the scan from Q chat panel.
                // Cancel only when the file scan state is "Running"
                await confirmStopSecurityScan(
                    onDemandFileScanState,
                    true,
                    CodeWhispererConstants.CodeAnalysisScope.FILE_ON_DEMAND,
                    editor?.document.fileName
                )
            }
            vsCodeState.isFreeTierLimitReached = false
        }
)

export const selectCustomizationPrompt = Commands.declare(
    { id: 'aws.amazonq.selectCustomization', compositeKey: { 1: 'source' } },
    () => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        if (isBuilderIdConnection(AuthUtil.instance.conn)) {
            throw new Error(`Select Customizations are not supported with the Amazon Builder ID connection.`)
        }
        telemetry.ui_click.emit({ elementId: 'cw_selectCustomization_Cta' })
        void showCustomizationPrompt().then()
    }
)

export const reconnect = Commands.declare(
    { id: 'aws.amazonq.reconnect', compositeKey: { 1: 'source' } },
    () => async (_: VsCodeCommandArg, source: CodeWhispererSource) => await AuthUtil.instance.reauthenticate()
)

/** @deprecated in favor of the `Add Connection` page */
export const showSsoSignIn = Commands.declare('aws.amazonq.sso', () => async () => {
    telemetry.ui_click.emit({ elementId: 'cw_signUp_Cta' })
    await showCodeWhispererConnectionPrompt()
})

// Shortcut command to directly connect to Identity Center or prompt start URL entry
// It can optionally set a customization too based on given values to match on

// This command is only declared and registered in Amazon Q if Q exists
export const connectWithCustomization = Commands.declare(
    { id: 'aws.codeWhisperer.connect', compositeKey: { 0: 'source' } },
    /**
     * This command supports the following arguments:
     * @param source - an identifier for who used this command. This value is not explicitly used in the function, but is used elsewhere.
     * startUrl and region. If both arguments are provided they will be used, otherwise
     *  the command prompts for them interactively.
     * customizationArn: select customization by ARN. If provided, `customizationNamePrefix` is ignored.
     * customizationNamePrefix: select customization by prefix, if `customizationArn` is `undefined`.
     */
    () =>
        async (
            source: string,
            startUrl?: string,
            region?: string,
            customizationArn?: string,
            customizationNamePrefix?: string
        ) => {
            SsoAccessTokenProvider.authSource = source
            if (startUrl && region) {
                await connectToEnterpriseSso(startUrl, region)
            } else {
                await getStartUrl()
            }

            // No customization match information given, exit early.
            if (!customizationArn && !customizationNamePrefix) {
                return
            }

            let persistedCustomizations = getPersistedCustomizations()

            // Check if any customizations have already been persisted.
            // If not, call `notifyNewCustomizations` to handle it then recheck.
            if (persistedCustomizations.length === 0) {
                await notifyNewCustomizations()
                persistedCustomizations = getPersistedCustomizations()
            }

            // If given an ARN, assume a specific customization is desired and find an entry that matches it. Ignores the prefix logic.
            // Otherwise if only a prefix is given, find an entry that matches it.
            // Backwards compatible with previous implementation.
            const match = customizationArn
                ? persistedCustomizations.find((c) => c.arn === customizationArn)
                : persistedCustomizations.find((c) => c.name?.startsWith(customizationNamePrefix as string))

            // If no match is found, nothing to do :)
            if (!match) {
                getLogger().error(
                    `No customization match found: arn=${customizationArn} prefix=${customizationNamePrefix}`
                )
                return
            }
            // Since we selected based on a match, we'll reuse the persisted values.
            await selectCustomization(match)
        }
)

export const showLearnMore = Commands.declare(
    { id: 'aws.amazonq._learnMore', compositeKey: { 0: 'source' } },
    () => async (source: CodeWhispererSource) => {
        telemetry.ui_click.emit({ elementId: 'cw_learnMore_Cta' })
        void openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUriGeneral))
    }
)

// TODO: Use a different URI
export const showFreeTierLimit = Commands.declare(
    { id: 'aws.amazonq.freeTierLimit', compositeKey: { 1: 'source' } },
    () => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        void openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
    }
)

export const updateReferenceLog = Commands.declare(
    {
        id: 'aws.amazonq.updateReferenceLog',
        logging: false,
    },
    () => () => {
        ReferenceLogViewProvider.instance.update()
    }
)

export const openSecurityIssuePanel = Commands.declare(
    'aws.amazonq.openSecurityIssuePanel',
    (context: ExtContext) => async (issue: CodeScanIssue | IssueItem, filePath: string) => {
        const targetIssue: CodeScanIssue = issue instanceof IssueItem ? issue.issue : issue
        const targetFilePath: string = issue instanceof IssueItem ? issue.filePath : filePath
        await showSecurityIssueWebview(context.extensionContext, targetIssue, targetFilePath)

        telemetry.codewhisperer_codeScanIssueViewDetails.emit({
            findingId: targetIssue.findingId,
            detectorId: targetIssue.detectorId,
            ruleId: targetIssue.ruleId,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
        TelemetryHelper.instance.sendCodeScanRemediationsEvent(
            undefined,
            'CODESCAN_ISSUE_VIEW_DETAILS',
            targetIssue.detectorId,
            targetIssue.findingId,
            targetIssue.ruleId,
            undefined,
            undefined,
            undefined,
            !!targetIssue.suggestedFixes.length
        )
    }
)

export const notifyNewCustomizationsCmd = Commands.declare(
    { id: 'aws.amazonq.notifyNewCustomizations', logging: false },
    () => () => {
        notifyNewCustomizations().catch((e) => {
            getLogger().error('notifyNewCustomizations failed: %s', (e as Error).message)
        })
    }
)

function focusQAfterDelay() {
    // this command won't work without a small delay after install
    globals.clock.setTimeout(() => {
        void focusAmazonQPanel.execute(placeholder, 'startDelay')
    }, 1000)
}

/**
 * Actually install Amazon Q.
 * Sometimes reload VS Code window after installation is necessary
 * to properly activate extension. In that case, VS Code will prompt user to reload.
 */
export const installAmazonQExtension = Commands.declare(
    { id: 'aws.toolkit.installAmazonQExtension', logging: true },
    () => async () => {
        if (isRemoteWorkspace()) {
            /**
             * due to a bug in https://github.com/microsoft/vscode/pull/206381/files#diff-efa08c29460835c0ffa740d751c34078033fd6cb6c7b031500fb31f524655de2R360
             * installExtension will fail on remote environments when the amazon q extension is already installed locally.
             * Until thats fixed we need to manually install the amazon q extension using the cli
             */
            const vscPath = await getVscodeCliPath()
            if (!vscPath) {
                throw new ToolkitError('installAmazonQ: Unable to find VSCode CLI path', {
                    code: 'CodeCLINotFound',
                })
            }
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    cancellable: false,
                },
                (progress, token) => {
                    progress.report({ message: 'Installing Amazon Q' })
                    return tryRun(vscPath, ['--install-extension', VSCODE_EXTENSION_ID.amazonq])
                }
            )
            return
        }
        await vscode.commands.executeCommand('workbench.extensions.installExtension', VSCODE_EXTENSION_ID.amazonq)

        // jump to Amazon Q extension view after install.
        focusQAfterDelay()
    }
)

export const applySecurityFix = Commands.declare(
    'aws.amazonq.applySecurityFix',
    () => async (issue: CodeScanIssue | IssueItem, filePath: string, source: Component) => {
        const targetIssue: CodeScanIssue = issue instanceof IssueItem ? issue.issue : issue
        const targetFilePath: string = issue instanceof IssueItem ? issue.filePath : filePath
        const targetSource: Component = issue instanceof IssueItem ? 'tree' : source
        const [suggestedFix] = targetIssue.suggestedFixes
        if (!suggestedFix || !targetFilePath || !suggestedFix.code) {
            return
        }

        const applyFixTelemetryEntry: Mutable<CodewhispererCodeScanIssueApplyFix> = {
            detectorId: targetIssue.detectorId,
            findingId: targetIssue.findingId,
            ruleId: targetIssue.ruleId,
            component: targetSource,
            result: 'Succeeded',
            credentialStartUrl: AuthUtil.instance.startUrl,
            codeFixAction: 'applyFix',
        }
        let languageId = undefined
        try {
            const document = await vscode.workspace.openTextDocument(targetFilePath)
            languageId = document.languageId
            const updatedContent = await getPatchedCode(targetFilePath, suggestedFix.code)
            if (!updatedContent) {
                void vscode.window.showErrorMessage(CodeWhispererConstants.codeFixAppliedFailedMessage)
                throw Error('Failed to get updated content from applying diff patch')
            }

            const edit = new vscode.WorkspaceEdit()
            edit.replace(
                document.uri,
                new vscode.Range(document.lineAt(0).range.start, document.lineAt(document.lineCount - 1).range.end),
                updatedContent
            )
            SecurityIssueProvider.instance.disableEventHandler()
            const isApplied = await vscode.workspace.applyEdit(edit)
            if (isApplied) {
                void document.save().then((didSave) => {
                    if (!didSave) {
                        getLogger().error('Apply fix command failed to save the document.')
                    }
                })
            } else {
                throw Error('Failed to apply edit to the workspace.')
            }
            // add accepted references to reference log, if any
            const fileName = path.basename(targetFilePath)
            const time = new Date().toLocaleString()
            // TODO: this is duplicated in controller.ts for test. Fix this later.
            suggestedFix.references?.forEach((reference) => {
                getLogger().debug('Processing reference: %O', reference)
                // Log values for debugging
                getLogger().debug('suggested fix code: %s', suggestedFix.code)
                getLogger().debug('updated content: %s', updatedContent)
                getLogger().debug(
                    'start: %d, end: %d',
                    reference.recommendationContentSpan?.start,
                    reference.recommendationContentSpan?.end
                )
                // given a start and end index, figure out which line number they belong to when splitting a string on /n characters
                const getLineNumber = (content: string, index: number): number => {
                    const lines = content.slice(0, index).split('\n')
                    return lines.length
                }
                const startLine = getLineNumber(updatedContent, reference.recommendationContentSpan!.start!)
                const endLine = getLineNumber(updatedContent, reference.recommendationContentSpan!.end!)
                getLogger().debug('startLine: %d, endLine: %d', startLine, endLine)
                const code = updatedContent.slice(
                    reference.recommendationContentSpan?.start,
                    reference.recommendationContentSpan?.end
                )
                getLogger().debug('Extracted code slice: %s', code)
                const referenceLog =
                    `[${time}] Accepted recommendation ` +
                    CodeWhispererConstants.referenceLogText(
                        `<br><code>${code}</code><br>`,
                        reference.licenseName!,
                        reference.repository!,
                        fileName,
                        startLine === endLine ? `(line at ${startLine})` : `(lines from ${startLine} to ${endLine})`
                    ) +
                    '<br>'
                getLogger().debug('Adding reference log: %s', referenceLog)
                ReferenceLogViewProvider.instance.addReferenceLog(referenceLog)
            })

            removeDiagnostic(document.uri, targetIssue)
            SecurityIssueProvider.instance.removeIssue(document.uri, targetIssue)
            SecurityIssueTreeViewProvider.instance.refresh()

            await closeSecurityIssueWebview(targetIssue.findingId)
            await closeDiff(targetFilePath)
            await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One })
            const linesLength = suggestedFix.code.split('\n').length
            const charsLength = suggestedFix.code.length
            if (targetIssue.fixJobId) {
                TelemetryHelper.instance.sendCodeFixAcceptanceEvent(
                    targetIssue.fixJobId,
                    languageId,
                    targetIssue.ruleId,
                    targetIssue.detectorId,
                    linesLength,
                    charsLength
                )
            }
        } catch (err) {
            getLogger().error(`Apply fix command failed. ${err}`)
            applyFixTelemetryEntry.result = 'Failed'
            applyFixTelemetryEntry.reason = getTelemetryReason(err)
            applyFixTelemetryEntry.reasonDesc = getTelemetryReasonDesc(err)
        } finally {
            telemetry.codewhisperer_codeScanIssueApplyFix.emit(applyFixTelemetryEntry)
            TelemetryHelper.instance.sendCodeScanRemediationsEvent(
                languageId,
                'CODESCAN_ISSUE_APPLY_FIX',
                targetIssue.detectorId,
                targetIssue.findingId,
                targetIssue.ruleId,
                source,
                applyFixTelemetryEntry.reasonDesc,
                applyFixTelemetryEntry.result,
                !!targetIssue.suggestedFixes.length
            )
        }
    }
)

export const signoutCodeWhisperer = Commands.declare(
    { id: 'aws.amazonq.signout', compositeKey: { 1: 'source' } },
    (auth: AuthUtil) => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        await auth.secondaryAuth.deleteConnection()
        SecurityIssueTreeViewProvider.instance.refresh()
        return focusAmazonQPanel.execute(placeholder, source)
    }
)

let _toolkitApi: any = undefined

const registerToolkitApiCallbackOnce = once(() => {
    getLogger().info(`toolkitApi: Registering callbacks of toolkit api`)
    const auth = Auth.instance

    auth.onDidChangeConnectionState(async (e) => {
        if (_toolkitApi && 'declareConnection' in _toolkitApi) {
            const id = e.id
            const conn = await auth.getConnection({ id })
            if (conn?.type === 'sso') {
                getLogger().info(`toolkitApi: declare connection ${id}`)
                _toolkitApi.declareConnection(
                    {
                        ssoRegion: conn.ssoRegion,
                        startUrl: conn.startUrl,
                    },
                    'Amazon Q'
                )
            }
        }
    })
    auth.onDidDeleteConnection(async (event) => {
        if (_toolkitApi && 'undeclareConnection' in _toolkitApi && event.storedProfile?.type === 'sso') {
            const startUrl = event.storedProfile.startUrl
            getLogger().info(`toolkitApi: undeclare connection ${event.connId} with starturl: ${startUrl}`)
            _toolkitApi.undeclareConnection({ startUrl })
        }
    })
})

export const registerToolkitApiCallback = Commands.declare(
    { id: 'aws.amazonq.refreshConnectionCallback' },
    () => async (toolkitApi?: any) => {
        // While the Q/CW exposes an API for the Toolkit to register callbacks on auth changes,
        // we need to do it manually here because the Toolkit would have been unable to call
        // this API if the Q/CW extension started afterwards (and this code block is running).
        if (isExtensionInstalled(VSCODE_EXTENSION_ID.awstoolkit)) {
            getLogger().info(`Trying to register toolkit callback. Toolkit is installed,
                        toolkit activated = ${isExtensionActive(VSCODE_EXTENSION_ID.awstoolkit)}`)
            if (toolkitApi) {
                // when this command is executed by AWS Toolkit activation
                _toolkitApi = toolkitApi.getApi(VSCODE_EXTENSION_ID.amazonq)
            } else if (isExtensionActive(VSCODE_EXTENSION_ID.awstoolkit)) {
                // when this command is executed by Amazon Q activation
                const toolkitExt = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)
                _toolkitApi = toolkitExt?.exports?.getApi(VSCODE_EXTENSION_ID.amazonq)
            }
            if (_toolkitApi) {
                registerToolkitApiCallbackOnce()
                // Declare current conn immediately
                const currentConn = AuthUtil.instance.conn
                if (currentConn?.type === 'sso') {
                    _toolkitApi.declareConnection(
                        {
                            type: currentConn.type,
                            ssoRegion: currentConn.ssoRegion,
                            startUrl: currentConn.startUrl,
                            id: currentConn.id,
                        } as AwsConnection,
                        'Amazon Q'
                    )
                }
            }
        }
    }
)

export const clearFilters = Commands.declare(
    { id: 'aws.amazonq.securityIssuesTreeFilter.clearFilters' },
    () => async () => {
        await SecurityTreeViewFilterState.instance.resetFilters()
    }
)

export const generateFix = Commands.declare(
    { id: 'aws.amazonq.security.generateFix' },
    (client: DefaultCodeWhispererClient, context: ExtContext) =>
        async (
            issue: CodeScanIssue | IssueItem | undefined,
            filePath: string,
            source: Component,
            refresh: boolean = false
        ) => {
            const targetIssue: CodeScanIssue | undefined = issue instanceof IssueItem ? issue.issue : issue
            const targetFilePath: string = issue instanceof IssueItem ? issue.filePath : filePath
            const targetSource: Component = issue instanceof IssueItem ? 'tree' : source
            if (!targetIssue) {
                return
            }
            await telemetry.codewhisperer_codeScanIssueGenerateFix.run(async () => {
                try {
                    await vscode.commands
                        .executeCommand('aws.amazonq.openSecurityIssuePanel', targetIssue, targetFilePath)
                        .then(undefined, (e) => {
                            getLogger().error('Failed to open security issue panel: %s', e.message)
                        })
                    await updateSecurityIssueWebview({
                        isGenerateFixLoading: true,
                        isGenerateFixError: false,
                        context: context.extensionContext,
                        filePath: targetFilePath,
                        shouldRefreshView: false,
                    })

                    codeFixState.setToRunning()
                    let hasSuggestedFix = false
                    const { suggestedFix, jobId } = await startCodeFixGeneration(
                        client,
                        targetIssue,
                        targetFilePath,
                        targetIssue.findingId
                    )
                    // redact the fix if the user disabled references and there is a reference
                    if (
                        // TODO: enable references later for scans
                        // !CodeWhispererSettings.instance.isSuggestionsWithCodeReferencesEnabled() &&
                        suggestedFix?.references &&
                        suggestedFix?.references?.length > 0
                    ) {
                        getLogger().debug(
                            `Received fix with reference and user settings disallow references. Job ID: ${jobId}`
                        )
                        // TODO: re-enable notifications once references published
                        // void vscode.window.showInformationMessage(
                        //     'Your settings do not allow code generation with references.'
                        // )
                        hasSuggestedFix = false
                    } else {
                        hasSuggestedFix = suggestedFix !== undefined
                    }
                    const updatedIssue: CodeScanIssue = {
                        ...targetIssue,
                        fixJobId: jobId,
                        suggestedFixes:
                            hasSuggestedFix && suggestedFix
                                ? [
                                      {
                                          code: suggestedFix.codeDiff,
                                          description: suggestedFix.description ?? '',
                                          references: suggestedFix.references,
                                      },
                                  ]
                                : [],
                    }
                    await updateSecurityIssueWebview({
                        issue: updatedIssue,
                        isGenerateFixLoading: false,
                        filePath: targetFilePath,
                        context: context.extensionContext,
                        shouldRefreshView: true,
                    })

                    SecurityIssueProvider.instance.updateIssue(updatedIssue, targetFilePath)
                    SecurityIssueTreeViewProvider.instance.refresh()
                } catch (err) {
                    await updateSecurityIssueWebview({
                        issue: targetIssue,
                        isGenerateFixLoading: false,
                        isGenerateFixError: true,
                        filePath: targetFilePath,
                        context: context.extensionContext,
                        shouldRefreshView: true,
                    })
                    SecurityIssueProvider.instance.updateIssue(targetIssue, targetFilePath)
                    SecurityIssueTreeViewProvider.instance.refresh()
                    throw err
                }
                telemetry.record({
                    component: targetSource,
                    detectorId: targetIssue.detectorId,
                    findingId: targetIssue.findingId,
                    ruleId: targetIssue.ruleId,
                    variant: refresh ? 'refresh' : undefined,
                })
            })
        }
)

export const rejectFix = Commands.declare(
    { id: 'aws.amazonq.security.rejectFix' },
    (context: vscode.ExtensionContext) => async (issue: CodeScanIssue | IssueItem | undefined, filePath: string) => {
        const targetIssue: CodeScanIssue | undefined = issue instanceof IssueItem ? issue.issue : issue
        const targetFilePath: string = issue instanceof IssueItem ? issue.filePath : filePath
        if (!targetIssue) {
            return
        }
        const updatedIssue: CodeScanIssue = { ...targetIssue, suggestedFixes: [] }
        await updateSecurityIssueWebview({
            issue: updatedIssue,
            context,
            filePath: targetFilePath,
            shouldRefreshView: false,
        })

        SecurityIssueProvider.instance.updateIssue(updatedIssue, targetFilePath)
        SecurityIssueTreeViewProvider.instance.refresh()
        await closeDiff(targetFilePath)

        return updatedIssue
    }
)

export const regenerateFix = Commands.declare(
    { id: 'aws.amazonq.security.regenerateFix' },
    () => async (issue: CodeScanIssue | IssueItem | undefined, filePath: string, source: Component) => {
        const targetIssue: CodeScanIssue | undefined = issue instanceof IssueItem ? issue.issue : issue
        const targetFilePath: string = issue instanceof IssueItem ? issue.filePath : filePath
        const targetSource: Component = issue instanceof IssueItem ? 'tree' : source
        const updatedIssue = await rejectFix.execute(targetIssue, targetFilePath)
        await generateFix.execute(updatedIssue, targetFilePath, targetSource, true)
    }
)

export const explainIssue = Commands.declare(
    { id: 'aws.amazonq.security.explain' },
    () => async (issueItem: IssueItem) => {
        await vscode.commands.executeCommand('aws.amazonq.explainIssue', issueItem.issue)
    }
)

export const ignoreAllIssues = Commands.declare(
    { id: 'aws.amazonq.security.ignoreAll' },
    () => async (issue: CodeScanIssue | IssueItem, source: Component) => {
        const targetIssue: CodeScanIssue = issue instanceof IssueItem ? issue.issue : issue
        const targetSource: Component = issue instanceof IssueItem ? 'tree' : source
        const resp = await vscode.window.showWarningMessage(
            CodeWhispererConstants.ignoreAllIssuesMessage(targetIssue.title),
            confirm,
            cancel
        )
        if (resp === confirm) {
            await telemetry.codewhisperer_codeScanIssueIgnore.run(async () => {
                const ignoredIssues = CodeWhispererSettings.instance.getIgnoredSecurityIssues()
                if (!ignoredIssues.includes(targetIssue.title)) {
                    await CodeWhispererSettings.instance.addToIgnoredSecurityIssuesList(targetIssue.title)
                }
                await closeSecurityIssueWebview(targetIssue.findingId)

                telemetry.record({
                    component: targetSource,
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    detectorId: targetIssue.detectorId,
                    findingId: targetIssue.findingId,
                    ruleId: targetIssue.ruleId,
                    variant: 'all',
                })
            })
        }
    }
)

export const ignoreIssue = Commands.declare(
    { id: 'aws.amazonq.security.ignore' },
    () => async (issue: CodeScanIssue | IssueItem, filePath: string, source: Component) => {
        await telemetry.codewhisperer_codeScanIssueIgnore.run(async () => {
            const targetIssue: CodeScanIssue = issue instanceof IssueItem ? issue.issue : issue
            const targetFilePath: string = issue instanceof IssueItem ? issue.filePath : filePath
            const targetSource: Component = issue instanceof IssueItem ? 'tree' : source
            const document = await vscode.workspace.openTextDocument(targetFilePath)

            const documentIsVisible = vscode.window.visibleTextEditors.some((editor) => editor.document === document)
            if (!documentIsVisible) {
                await vscode.window.showTextDocument(document, {
                    selection: new vscode.Range(targetIssue.startLine, 0, targetIssue.endLine, 0),
                    preserveFocus: true,
                    preview: true,
                    viewColumn: vscode.ViewColumn.One,
                })
            }
            insertCommentAboveLine(document, targetIssue.startLine, CodeWhispererConstants.amazonqIgnoreNextLine)
            await closeSecurityIssueWebview(targetIssue.findingId)

            telemetry.record({
                component: targetSource,
                credentialStartUrl: AuthUtil.instance.startUrl,
                detectorId: targetIssue.detectorId,
                findingId: targetIssue.findingId,
                ruleId: targetIssue.ruleId,
            })
        })
    }
)

export const showSecurityIssueFilters = Commands.declare({ id: 'aws.amazonq.security.showFilters' }, () => async () => {
    const filterState = SecurityTreeViewFilterState.instance.getState()
    const quickPickItems: vscode.QuickPickItem[] = severities.map((severity) => ({
        label: severity,
        picked: filterState.severity[severity],
    }))
    const result = await vscode.window.showQuickPick(quickPickItems, {
        title: localize('aws.commands.amazonq.filterIssues', 'Filter Issues'),
        placeHolder: localize('aws.amazonq.security.showFilters.placeholder', 'Select code issues to show'),
        canPickMany: true,
    })
    if (result) {
        await SecurityTreeViewFilterState.instance.setState({
            ...filterState,
            severity: severities.reduce(
                (p, c) => ({ ...p, [c]: result.map(({ label }) => label).includes(c) }),
                {}
            ) as SecurityIssueFilters['severity'],
        })
    }
})

export const focusIssue = Commands.declare(
    { id: 'aws.amazonq.security.focusIssue' },
    () => async (issue: CodeScanIssue, filePath: string) => {
        const document = await vscode.workspace.openTextDocument(filePath)
        void vscode.window.showTextDocument(document, {
            selection: new vscode.Range(issue.startLine, 0, issue.endLine, 0),
            preserveFocus: true,
            preview: true,
            viewColumn: vscode.ViewColumn.One,
        })

        if (isSecurityIssueWebviewOpen()) {
            void vscode.commands.executeCommand('aws.amazonq.openSecurityIssuePanel', issue, filePath)
        }
    }
)
