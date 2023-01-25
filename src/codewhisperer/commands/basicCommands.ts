/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { showView } from '../vue/backend'
import { ExtContext } from '../../shared/extensions'
import { Commands } from '../../shared/vscode/commands2'
import * as CodeWhispererConstants from '../models/constants'
import { getLogger } from '../../shared/logger'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { startSecurityScanWithProgress } from './startSecurityScan'
import { SecurityPanelViewProvider } from '../views/securityPanelViewProvider'
import { codeScanState } from '../models/model'
import { showConnectionPrompt } from '../util/showSsoPrompt'
import { ReferenceLogViewProvider } from '../service/referenceLogViewProvider'
import { AuthUtil } from '../util/authUtil'

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
    (context: ExtContext) => async () => {
        showView(context.extensionContext)
    }
)

export const showReferenceLog = Commands.declare(
    'aws.codeWhisperer.openReferencePanel',
    (context: ExtContext) => async () => {
        await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-reference-log')
    }
)

export const showIntroduction = Commands.declare('aws.codeWhisperer.introduction', () => async () => {
    vscode.env.openExternal(vscode.Uri.parse(CodeWhispererConstants.learnMoreUriGeneral))
})

export const showSecurityScan = Commands.declare(
    'aws.codeWhisperer.security.scan',
    (context: ExtContext, securityPanelViewProvider: SecurityPanelViewProvider, client: DefaultCodeWhispererClient) =>
        async () => {
            if (AuthUtil.instance.isConnectionExpired()) {
                await AuthUtil.instance.showReauthenticatePrompt()
            }
            const editor = vscode.window.activeTextEditor
            if (editor) {
                if (!codeScanState.running) {
                    codeScanState.running = true
                    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
                    startSecurityScanWithProgress(securityPanelViewProvider, editor, client, context.extensionContext)
                }
            } else {
                vscode.window.showInformationMessage('Open a valid file to scan.')
            }
        }
)

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
