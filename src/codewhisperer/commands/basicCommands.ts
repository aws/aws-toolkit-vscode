/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { telemetry } from '../../shared/telemetry/telemetry'
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

export const enableCodeSuggestions = Commands.declare(
    'aws.codeWhisperer.enableCodeSuggestions',
    (context: vscode.ExtensionContext) => async () => {
        await set(CodeWhispererConstants.autoTriggerEnabledKey, true, context.globalState)
        await vscode.commands.executeCommand('setContext', 'CODEWHISPERER_ENABLED', true)
        await vscode.commands.executeCommand('aws.codeWhisperer.refresh')

        const hasShownWelcomeMsgBefore = get(CodeWhispererConstants.welcomeMessageKey, context.globalState)
        if (!hasShownWelcomeMsgBefore) {
            showCodeWhispererWelcomeMessage(context)
            await set(CodeWhispererConstants.welcomeMessageKey, true, context.globalState)
        }
        if (!isCloud9()) {
            await vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
        }
    }
)

export const showReferenceLog = Commands.declare('aws.codeWhisperer.openReferencePanel', () => async () => {
    await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-reference-log')
})

export const showIntroduction = Commands.declare('aws.codeWhisperer.introduction', () => async () => {
    vscode.env.openExternal(vscode.Uri.parse(CodeWhispererConstants.learnMoreUriGeneral))
})

export const showSecurityScan = Commands.declare(
    'aws.codeWhisperer.security.scan',
    (
            context: vscode.ExtensionContext,
            securityPanelViewProvider: SecurityPanelViewProvider,
            client: DefaultCodeWhispererClient
        ) =>
        async () => {
            if (AuthUtil.instance.isConnectionExpired()) {
                await AuthUtil.instance.notifyReauthenticate()
            }
            const editor = vscode.window.activeTextEditor
            if (editor) {
                if (codeScanState.isNotStarted()) {
                    // User intends to start as "Start Security Scan" is shown in the explorer tree
                    codeScanState.setToRunning()
                    startSecurityScanWithProgress(securityPanelViewProvider, editor, client, context)
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

    vscode.env.openExternal(vscode.Uri.parse(CodeWhispererConstants.learnMoreUriGeneral))
})

export const showAccessTokenErrorLearnMore = Commands.declare(
    'aws.codeWhisperer.accessTokenErrorLearnMore',
    () => async () => {
        vscode.env.openExternal(vscode.Uri.parse(CodeWhispererConstants.accessTokenMigrationLearnMoreUri))
    }
)

// TODO: Use a different URI
export const showFreeTierLimit = Commands.declare('aws.codeWhisperer.freeTierLimit', () => async () => {
    vscode.env.openExternal(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
})

export const updateReferenceLog = Commands.declare('aws.codeWhisperer.updateReferenceLog', () => () => {
    ReferenceLogViewProvider.instance.update()
})

async function showCodeWhispererWelcomeMessage(context: vscode.ExtensionContext): Promise<void> {
    const filePath = isCloud9()
        ? context.asAbsolutePath(CodeWhispererConstants.welcomeCodeWhispererCloud9Readme)
        : context.asAbsolutePath(CodeWhispererConstants.welcomeCodeWhispererReadmeFileSource)
    const readmeUri = vscode.Uri.file(filePath)
    await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
}

export const refreshStatusBar = Commands.declare('aws.codeWhisperer.refreshStatusBar', () => () => {
    if (AuthUtil.instance.isConnectionValid()) {
        InlineCompletionService.instance.setCodeWhispererStatusBarOk()
    } else {
        InlineCompletionService.instance.setCodeWhispererStatusBarDisconnected()
    }
})
