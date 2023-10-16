/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ExtContext } from '../../shared/extensions'
import { Commands } from '../../shared/vscode/commands2'
import * as CodeWhispererConstants from '../models/constants'
import { getLogger } from '../../shared/logger'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { startSecurityScanWithProgress, confirmStopSecurityScan } from './startSecurityScan'
import { SecurityPanelViewProvider } from '../views/securityPanelViewProvider'
import { codeScanState } from '../models/model'
import { showConnectionPrompt } from '../util/showSsoPrompt'
import { ReferenceLogViewProvider } from '../service/referenceLogViewProvider'
import { AuthUtil } from '../util/authUtil'
import { isCloud9 } from '../../shared/extensionUtilities'
import { InlineCompletionService } from '../service/inlineCompletionService'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
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
    (context: ExtContext) => async () => {
        await set(CodeWhispererConstants.autoTriggerEnabledKey, true, context.extensionContext.globalState)
        await vscode.commands.executeCommand('setContext', 'CODEWHISPERER_ENABLED', true)
        await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
        if (!isCloud9()) {
            await vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
        }
    }
)

export const disableCodeSuggestions = Commands.declare(
    'aws.codeWhisperer.disableCodeSuggestions',
    (context: ExtContext) => async () => {
        await set(CodeWhispererConstants.autoTriggerEnabledKey, false, context.extensionContext.globalState)
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

export const reconnect = Commands.declare('aws.codeWhisperer.reconnect', () => async () => {
    await AuthUtil.instance.reauthenticate()
})

export function get(key: string, context: vscode.Memento): any {
    return context.get(key)
}

export async function set(key: string, value: any, context: vscode.Memento): Promise<void> {
    await context.update(key, value).then(
        () => {},
        error => {
            getLogger().verbose(`Failed to update global state: ${error}`)
        }
    )
}

export const showSsoSignIn = Commands.declare('aws.codeWhisperer.sso', () => async () => {
    telemetry.ui_click.emit({ elementId: 'cw_signUp_Cta' })
    await showConnectionPrompt()
})

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
