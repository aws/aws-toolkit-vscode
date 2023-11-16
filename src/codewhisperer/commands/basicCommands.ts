/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ExtContext } from '../../shared/extensions'
import { Commands, VsCodeCommandArg } from '../../shared/vscode/commands2'
import * as CodeWhispererConstants from '../models/constants'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { startSecurityScanWithProgress, confirmStopSecurityScan } from './startSecurityScan'
import { startTransformByQWithProgress, confirmStopTransformByQ } from './startTransformByQ'
import { SecurityPanelViewProvider } from '../views/securityPanelViewProvider'
import { CodeSuggestionsState, codeScanState, transformByQState } from '../models/model'
import { connectToEnterpriseSso, getStartUrl } from '../util/getStartUrl'
import { showConnectionPrompt } from '../util/showSsoPrompt'
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
import { CodeWhispererSource } from './types'
import { showManageConnections } from '../../auth/ui/vue/show'

export const toggleCodeSuggestions = Commands.declare(
    { id: 'aws.codeWhisperer.toggleCodeSuggestion', compositeKey: { 1: 'source' } },
    (suggestionState: CodeSuggestionsState) => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        const isSuggestionsEnabled = await suggestionState.toggleSuggestions()
        telemetry.aws_modifySetting.emit({
            settingId: CodeWhispererConstants.autoSuggestionConfig.settingId,
            settingState: isSuggestionsEnabled
                ? CodeWhispererConstants.autoSuggestionConfig.activated
                : CodeWhispererConstants.autoSuggestionConfig.deactivated,
        })
    }
)

export const enableCodeSuggestions = Commands.declare(
    'aws.codeWhisperer.enableCodeSuggestions',
    (context: ExtContext) =>
        async (isAuto: boolean = true) => {
            await CodeSuggestionsState.instance.setSuggestionsEnabled(isAuto)
            await vscode.commands.executeCommand('setContext', 'CODEWHISPERER_ENABLED', true)
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
    openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUriGeneral))
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
                    startSecurityScanWithProgress(securityPanelViewProvider, editor, client, context.extensionContext)
                } else if (codeScanState.isRunning()) {
                    // User intends to stop as "Stop Security Scan" is shown in the explorer tree
                    // Cancel only when the code scan state is "Running"
                    await confirmStopSecurityScan()
                }
                await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
            } else {
                vscode.window.showInformationMessage('Open a valid file to scan.')
            }
        }
)

export const showTransformByQ = Commands.declare('aws.awsq.transform', (context: ExtContext) => async () => {
    if (AuthUtil.instance.isConnectionExpired()) {
        await AuthUtil.instance.notifyReauthenticate()
    }

    if (transformByQState.isNotStarted()) {
        startTransformByQWithProgress()
    } else if (transformByQState.isCancelled()) {
        vscode.window.showInformationMessage(CodeWhispererConstants.cancellationInProgressMessage)
    } else if (transformByQState.isRunning()) {
        await confirmStopTransformByQ(transformByQState.getJobId())
    }
    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
})

export const showTransformationHub = Commands.declare('aws.codeWhisperer.showTransformationHub', () => async () => {
    await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-transformation-hub')
})

export const selectCustomizationPrompt = Commands.declare(
    { id: 'aws.codeWhisperer.selectCustomization', compositeKey: { 1: 'source' } },
    () => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        telemetry.ui_click.emit({ elementId: 'cw_selectCustomization_Cta' })
        showCustomizationPrompt().then()
    }
)

export const reconnect = Commands.declare(
    { id: 'aws.codeWhisperer.reconnect', compositeKey: { 1: 'source' } },
    () => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        await AuthUtil.instance.reauthenticate()
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
    await showConnectionPrompt()
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
        openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUriGeneral))
    }
)

// TODO: Use a different URI
export const showFreeTierLimit = Commands.declare(
    { id: 'aws.codeWhisperer.freeTierLimit', compositeKey: { 1: 'source' } },
    () => async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
    }
)

export const updateReferenceLog = Commands.declare(
    {
        id: 'aws.codeWhisperer.updateReferenceLog',
        logging: false,
    },
    () => () => {
        return ReferenceLogViewProvider.instance.update()
    }
)

export const notifyNewCustomizationsCmd = Commands.declare(
    { id: 'aws.codeWhisperer.notifyNewCustomizations', logging: false },
    () => () => {
        notifyNewCustomizations().then()
    }
)

/**
 * Forces focus to Amazon Q panel - USE THIS SPARINGLY (don't betray customer trust by hijacking the IDE)
 * Used on first load, and any time we want to directly populate chat.
 */
export async function focusAmazonQPanel(): Promise<void> {
    // VS Code-owned command: "View: Show Amazon Q"
    await vscode.commands.executeCommand('workbench.view.extension.amazonq')
}

export const signoutCodeWhisperer = Commands.declare(
    { id: 'aws.codewhisperer.signout', compositeKey: { 1: 'source' } },
    (auth: AuthUtil) => (_: VsCodeCommandArg, source: CodeWhispererSource) => {
        return auth.secondaryAuth.deleteConnection()
    }
)
