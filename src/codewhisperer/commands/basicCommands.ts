/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ExtContext } from '../../shared/extensions'
import { Commands } from '../../shared/vscode/commands2'
import * as CodeWhispererConstants from '../models/constants'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { startSecurityScanWithProgress, confirmStopSecurityScan } from './startSecurityScan'
import { SecurityPanelViewProvider } from '../views/securityPanelViewProvider'
import { codeScanState } from '../models/model'
import { connectToEnterpriseSso, getStartUrl } from '../util/getStartUrl'
import { showConnectionPrompt } from '../util/showSsoPrompt'
import { ReferenceLogViewProvider } from '../service/referenceLogViewProvider'
import { AuthUtil } from '../util/authUtil'
import { isCloud9 } from '../../shared/extensionUtilities'
import { InlineCompletionService } from '../service/inlineCompletionService'
import { getLogger } from '../../shared/logger'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import {
    getPersistedCustomizations,
    notifyNewCustomizations,
    selectCustomization,
    showCustomizationPrompt,
} from '../util/customizationUtil'
import { get, set } from '../util/commonUtil'
import { CodeWhispererCommandDeclarations } from '../commands/gettingStartedPageCommands'
import { getIcon } from '../../shared/icons'
import { localize } from '../../shared/utilities/vsCodeUtils'

export const toggleCodeSuggestions = Commands.declare(
    'aws.codeWhisperer.toggleCodeSuggestion',
    (globalState: vscode.Memento) => async () => {
        const autoTriggerEnabled: boolean = get(CodeWhispererConstants.autoTriggerEnabledKey, globalState) || false
        const toSet: boolean = !autoTriggerEnabled
        await set(CodeWhispererConstants.autoTriggerEnabledKey, toSet, globalState)
        await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
        telemetry.aws_modifySetting.emit({
            settingId: CodeWhispererConstants.autoSuggestionConfig.settingId,
            settingState: toSet
                ? CodeWhispererConstants.autoSuggestionConfig.activated
                : CodeWhispererConstants.autoSuggestionConfig.deactivated,
        })
    }
)
/*
createGettingStartedNode(Learn) will be a childnode of CodeWhisperer
onClick on this "Learn" Node will open the Learn CodeWhisperer Page.
*/
export const createGettingStartedNode = () =>
    CodeWhispererCommandDeclarations.instance.declared.showGettingStartedPage
        .build('codewhispererDeveloperTools')
        .asTreeNode({
            label: localize('AWS.explorerNode.codewhispererGettingStartedNode.label', 'Learn'),
            iconPath: getIcon('aws-codewhisperer-learn'),
        })

export const enableCodeSuggestions = Commands.declare(
    'aws.codeWhisperer.enableCodeSuggestions',
    (context: ExtContext) =>
        async (isAuto: boolean = true) => {
            await set(CodeWhispererConstants.autoTriggerEnabledKey, isAuto, context.extensionContext.globalState)
            await vscode.commands.executeCommand('setContext', 'CODEWHISPERER_ENABLED', true)
            await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
            if (!isCloud9()) {
                await vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
            }
        }
)

export const showReferenceLog = Commands.declare(
    'aws.codeWhisperer.openReferencePanel',
    (context: ExtContext) => async () => {
        await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-reference-log')
    }
)

export const showIntroduction = Commands.declare('aws.codeWhisperer.introduction', () => async () => {
    openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUriGeneral))
})

export const showSecurityScan = Commands.declare(
    'aws.codeWhisperer.security.scan',
    (context: ExtContext, securityPanelViewProvider: SecurityPanelViewProvider, client: DefaultCodeWhispererClient) =>
        async () => {
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

export const selectCustomizationPrompt = Commands.declare('aws.codeWhisperer.selectCustomization', () => async () => {
    telemetry.ui_click.emit({ elementId: 'cw_selectCustomization_Cta' })
    showCustomizationPrompt().then()
})

export const reconnect = Commands.declare('aws.codeWhisperer.reconnect', () => async () => {
    await AuthUtil.instance.reauthenticate()
})

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

export const showLearnMore = Commands.declare('aws.codeWhisperer.learnMore', () => async () => {
    telemetry.ui_click.emit({ elementId: 'cw_learnMore_Cta' })
    openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUriGeneral))
})

// TODO: Use a different URI
export const showFreeTierLimit = Commands.declare('aws.codeWhisperer.freeTierLimit', () => async () => {
    openUrl(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
})

export const updateReferenceLog = Commands.declare(
    { id: 'aws.codeWhisperer.updateReferenceLog', logging: false },
    () => () => {
        ReferenceLogViewProvider.instance.update()
    }
)

export const refreshStatusBar = Commands.declare(
    { id: 'aws.codeWhisperer.refreshStatusBar', logging: false },
    () => () => {
        if (AuthUtil.instance.isConnectionValid()) {
            InlineCompletionService.instance.setCodeWhispererStatusBarOk()
        } else if (AuthUtil.instance.isConnectionExpired()) {
            InlineCompletionService.instance.setCodeWhispererStatusBarDisconnected()
        } else {
            InlineCompletionService.instance.hideCodeWhispererStatusBar()
        }
    }
)

export const notifyNewCustomizationsCmd = Commands.declare(
    { id: 'aws.codeWhisperer.notifyNewCustomizations', logging: false },
    () => () => {
        notifyNewCustomizations().then()
    }
)
