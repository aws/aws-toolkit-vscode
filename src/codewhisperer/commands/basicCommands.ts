/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CodewhispererCodeScanIssueApplyFix, Component, telemetry } from '../../shared/telemetry/telemetry'
import { ExtContext } from '../../shared/extensions'
import { Commands, VsCodeCommandArg } from '../../shared/vscode/commands2'
import * as CodeWhispererConstants from '../models/constants'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { startSecurityScanWithProgress, confirmStopSecurityScan } from './startSecurityScan'
import { startTransformByQWithProgress, confirmStopTransformByQ } from './startTransformByQ'
import { SecurityPanelViewProvider } from '../views/securityPanelViewProvider'
import { CodeScanIssue, codeScanState, CodeSuggestionsState, transformByQState } from '../models/model'
import { connectToEnterpriseSso, getStartUrl } from '../util/getStartUrl'
import { showCodeWhispererConnectionPrompt } from '../util/showSsoPrompt'
import { ReferenceLogViewProvider } from '../service/referenceLogViewProvider'
import { AuthUtil } from '../util/authUtil'
import { isCloud9 } from '../../shared/extensionUtilities'
import { getLogger } from '../../shared/logger'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import {
    getPersistedCustomizations,
    notifyNewCustomizations,
    selectCustomization,
    showCustomizationPrompt,
} from '../util/customizationUtil'
import { applyPatch } from 'diff'
import { closeSecurityIssueWebview, showSecurityIssueWebview } from '../views/securityIssue/securityIssueWebview'
import { fsCommon } from '../../srcShared/fs'
import { Mutable } from '../../shared/utilities/tsUtils'
import { CodeWhispererSource } from './types'
import { showManageConnections } from '../../auth/ui/vue/show'
import {
    CancelActionPositions,
    logCodeTransformInitiatedMetric,
} from '../../amazonqGumby/telemetry/codeTransformTelemetry'
import { FeatureConfigProvider } from '../service/featureConfigProvider'

export const toggleCodeSuggestions = Commands.declare(
    { id: 'aws.codeWhisperer.toggleCodeSuggestion', compositeKey: { 1: 'source' } },
    (suggestionState: CodeSuggestionsState) => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        await telemetry.aws_modifySetting.run(async span => {
            span.record({
                settingId: CodeWhispererConstants.autoSuggestionConfig.settingId,
            })

            const isSuggestionsEnabled = await suggestionState.toggleSuggestions()
            span.record({
                settingState: isSuggestionsEnabled
                    ? CodeWhispererConstants.autoSuggestionConfig.activated
                    : CodeWhispererConstants.autoSuggestionConfig.deactivated,
            })

            await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
        })
    }
)

export const enableCodeSuggestions = Commands.declare(
    'aws.codeWhisperer.enableCodeSuggestions',
    (context: ExtContext) =>
        async (isAuto: boolean = true) => {
            await CodeSuggestionsState.instance.setSuggestionsEnabled(isAuto)
            await vscode.commands.executeCommand('setContext', 'aws.codewhisperer.connected', true)
            await vscode.commands.executeCommand('setContext', 'aws.codewhisperer.connectionExpired', false)
            await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
            if (!isCloud9()) {
                await vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
            }
        }
)

export const showReferenceLog = Commands.declare(
    { id: 'aws.codeWhisperer.openReferencePanel', compositeKey: { 1: 'source' } },
    () => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-reference-log')
    }
)

export const showIntroduction = Commands.declare('aws.codeWhisperer.introduction', () => async () => {
    void openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUriGeneral))
})

export const showSecurityScan = Commands.declare(
    { id: 'aws.codeWhisperer.security.scan', compositeKey: { 1: 'source' } },
    (context: ExtContext, securityPanelViewProvider: SecurityPanelViewProvider, client: DefaultCodeWhispererClient) =>
        async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
            if (AuthUtil.instance.isConnectionExpired()) {
                await AuthUtil.instance.notifyReauthenticate()
            }
            const editor = vscode.window.activeTextEditor
            if (editor) {
                if (codeScanState.isNotStarted()) {
                    // User intends to start as "Start Security Scan" is shown in the explorer tree
                    codeScanState.setToRunning()
                    void startSecurityScanWithProgress(
                        securityPanelViewProvider,
                        editor,
                        client,
                        context.extensionContext
                    )
                } else if (codeScanState.isRunning()) {
                    // User intends to stop as "Stop Security Scan" is shown in the explorer tree
                    // Cancel only when the code scan state is "Running"
                    await confirmStopSecurityScan()
                }
                await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
            } else {
                void vscode.window.showInformationMessage('Open a valid file to scan.')
            }
        }
)

export const showTransformByQ = Commands.declare(
    { id: 'aws.awsq.transform', compositeKey: { 0: 'source' } },
    (context: ExtContext) => async (source: string) => {
        if (AuthUtil.instance.isConnectionExpired()) {
            await AuthUtil.instance.notifyReauthenticate()
        }

        if (transformByQState.isNotStarted()) {
            logCodeTransformInitiatedMetric(source)
            await startTransformByQWithProgress()
        } else if (transformByQState.isCancelled()) {
            void vscode.window.showInformationMessage(CodeWhispererConstants.cancellationInProgressMessage)
        } else if (transformByQState.isRunning()) {
            await confirmStopTransformByQ(transformByQState.getJobId(), CancelActionPositions.DevToolsSidePanel)
        }
        // emit telemetry if clicked from tree node
        if (source === CodeWhispererConstants.transformTreeNode) {
            telemetry.ui_click.emit({
                elementId: 'amazonq_transform',
                passive: false,
            })
        }
        await Commands.tryExecute('aws.codeWhisperer.refresh')
    }
)

export const showTransformationHub = Commands.declare(
    { id: 'aws.amazonq.showTransformationHub', compositeKey: { 0: 'source' } },
    () => async (source: string) => {
        await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-transformation-hub')
    }
)

export const selectCustomizationPrompt = Commands.declare(
    { id: 'aws.codeWhisperer.selectCustomization', compositeKey: { 1: 'source' } },
    () => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        telemetry.ui_click.emit({ elementId: 'cw_selectCustomization_Cta' })
        void showCustomizationPrompt().then()
    }
)

export const reconnect = Commands.declare(
    { id: 'aws.codewhisperer.reconnect', compositeKey: { 1: 'source' } },
    () =>
        async (_: VsCodeCommandArg, source: CodeWhispererSource, addMissingScopes: boolean = false) => {
            if (typeof addMissingScopes !== 'boolean') {
                addMissingScopes = false
            }
            await AuthUtil.instance.reauthenticate(addMissingScopes)
        }
)

/** Opens the Add Connections webview with CW highlighted */
export const showManageCwConnections = Commands.declare(
    { id: 'aws.codewhisperer.manageConnections', compositeKey: { 1: 'source' } },
    () => (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        return showManageConnections.execute(_, source, 'codewhisperer')
    }
)

/** @deprecated in favor of the `Add Connection` page */
export const showSsoSignIn = Commands.declare('aws.codeWhisperer.sso', () => async () => {
    telemetry.ui_click.emit({ elementId: 'cw_signUp_Cta' })
    await showCodeWhispererConnectionPrompt()
})

// Shortcut command to directly connect to Identity Center or prompt start URL entry
// It can optionally set a customization too based on given values to match on
export const connectWithCustomization = Commands.declare(
    'aws.codeWhisperer.connect',
    () => async (startUrl?: string, region?: string, customizationArn?: string, customizationNamePrefix?: string) => {
        // This command supports the following arguments:
        //  * startUrl and region. If both arguments are provided they will be used, otherwise
        //    the command prompts for them interactively.
        //  * customizationArn: select customization by ARN. If provided, `customizationNamePrefix` is ignored.
        //  * customizationNamePrefix: select customization by prefix, if `customizationArn` is `undefined`.
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
            ? persistedCustomizations.find(c => c.arn === customizationArn)
            : persistedCustomizations.find(c => c.name?.startsWith(customizationNamePrefix as string))

        // If no match is found, nothing to do :)
        if (!match) {
            getLogger().error(`No customization match found: arn=${customizationArn} prefix=${customizationNamePrefix}`)
            return
        }
        // Since we selected based on a match, we'll reuse the persisted values.
        await selectCustomization(match)
    }
)

export const showLearnMore = Commands.declare(
    { id: 'aws.codeWhisperer.learnMore', compositeKey: { 0: 'source' } },
    () => async (source: CodeWhispererSource) => {
        telemetry.ui_click.emit({ elementId: 'cw_learnMore_Cta' })
        void openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUriGeneral))
    }
)

// TODO: Use a different URI
export const showFreeTierLimit = Commands.declare(
    { id: 'aws.codeWhisperer.freeTierLimit', compositeKey: { 1: 'source' } },
    () => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        void openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
    }
)

export const updateReferenceLog = Commands.declare(
    {
        id: 'aws.codeWhisperer.updateReferenceLog',
        logging: false,
    },
    () => () => {
        ReferenceLogViewProvider.instance.update()
    }
)

export const openSecurityIssuePanel = Commands.declare(
    'aws.codeWhisperer.openSecurityIssuePanel',
    (context: ExtContext) => async (issue: CodeScanIssue, filePath: string) => {
        await showSecurityIssueWebview(context.extensionContext, issue, filePath)

        telemetry.codewhisperer_codeScanIssueViewDetails.emit({
            findingId: issue.findingId,
            detectorId: issue.detectorId,
            ruleId: issue.ruleId,
        })
    }
)

export const notifyNewCustomizationsCmd = Commands.declare(
    { id: 'aws.codeWhisperer.notifyNewCustomizations', logging: false },
    () => () => {
        notifyNewCustomizations().catch(e => {
            getLogger().error('notifyNewCustomizations failed: %s', (e as Error).message)
        })
    }
)

export const fetchFeatureConfigsCmd = Commands.declare(
    { id: 'aws.codeWhisperer.fetchFeatureConfigs', logging: false },
    () => async () => {
        await FeatureConfigProvider.instance.fetchFeatureConfigs()
    }
)

export const applySecurityFix = Commands.declare(
    'aws.codeWhisperer.applySecurityFix',
    () => async (issue: CodeScanIssue, filePath: string, source: Component) => {
        const [suggestedFix] = issue.suggestedFixes
        if (!suggestedFix || !filePath) {
            return
        }

        const applyFixTelemetryEntry: Mutable<CodewhispererCodeScanIssueApplyFix> = {
            detectorId: issue.detectorId,
            findingId: issue.findingId,
            ruleId: issue.ruleId,
            component: source,
            result: 'Succeeded',
        }

        try {
            const patch = suggestedFix.code
            const document = await vscode.workspace.openTextDocument(filePath)
            const fileContent = document.getText()

            const updatedContent = applyPatch(fileContent, patch)
            if (!updatedContent) {
                void vscode.window.showErrorMessage(CodeWhispererConstants.codeFixAppliedFailedMessage)
                throw Error('Failed to get updated content from applying diff patch')
            }

            // saving the document text if not save
            const isSaved = await document.save()
            if (!isSaved) {
                throw Error('Failed to save editor text changes into the file.')
            }

            // writing the patch applied version of document into the file
            await fsCommon.writeFile(filePath, updatedContent)
            void vscode.window
                .showInformationMessage(CodeWhispererConstants.codeFixAppliedSuccessMessage, {
                    title: CodeWhispererConstants.runSecurityScanButtonTitle,
                })
                .then(res => {
                    if (res?.title === CodeWhispererConstants.runSecurityScanButtonTitle) {
                        void vscode.commands.executeCommand('aws.codeWhisperer.security.scan')
                    }
                })
            await closeSecurityIssueWebview(issue.findingId)
        } catch (err) {
            getLogger().error(`Apply fix command failed. ${err}`)
            applyFixTelemetryEntry.result = 'Failed'
            applyFixTelemetryEntry.reason = err as string
        } finally {
            telemetry.codewhisperer_codeScanIssueApplyFix.emit(applyFixTelemetryEntry)
        }
    }
)

export const signoutCodeWhisperer = Commands.declare(
    { id: 'aws.codewhisperer.signout', compositeKey: { 1: 'source' } },
    (auth: AuthUtil) => (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        return auth.secondaryAuth.deleteConnection()
    }
)
