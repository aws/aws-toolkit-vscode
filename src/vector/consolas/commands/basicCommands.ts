/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { showView } from '../vue/backend'
import { ExtContext } from '../../../shared/extensions'
import { Commands } from '../../../shared/vscode/commands2'
import { ConsolasConstants } from '../models/constants'
import { getLogger } from '../../../shared/logger'
import { DefaultConsolasClient } from '../client/consolas'
import { showAccessTokenPrompt } from '../util/showAccessTokenPrompt'
import { startSecurityScanWithProgress } from './startSecurityScan'
import { SecurityPanelViewProvider } from '../views/securityPanelViewProvider'

export const toggleCodeSuggestions = Commands.declare(
    'aws.consolas.toggleCodeSuggestion',
    (context: ExtContext) => async () => {
        const autoTriggerEnabled: boolean = get(ConsolasConstants.autoTriggerEnabledKey, context) || false
        set(ConsolasConstants.autoTriggerEnabledKey, !autoTriggerEnabled, context)
        await vscode.commands.executeCommand('aws.consolas.refresh')
    }
)

export const enableCodeSuggestions = Commands.declare(
    'aws.consolas.enableCodeSuggestions',
    (context: ExtContext) => async () => {
        showView(context.extensionContext)
    }
)

export const showIntroduction = Commands.declare('aws.consolas.introduction', (context: ExtContext) => async () => {
    vscode.env.openExternal(vscode.Uri.parse(ConsolasConstants.learnMoreUri))
})

export const enterAccessToken = Commands.declare(
    'aws.consolas.enterAccessToken',
    (context: ExtContext, client: DefaultConsolasClient) => async () => {
        const setToken = async (token: string) => {
            set(ConsolasConstants.accessToken, token, context)
            await vscode.commands.executeCommand('aws.consolas.refresh')
        }
        await showAccessTokenPrompt(client, setToken)
    }
)

export const requestAccess = Commands.declare('aws.consolas.requestAccess', (context: ExtContext) => async () => {
    vscode.env.openExternal(vscode.Uri.parse(ConsolasConstants.previewSignupPortal))
})

export const showReferenceLog = Commands.declare(
    'aws.consolas.openReferencePanel',
    (context: ExtContext) => async () => {
        await vscode.commands.executeCommand('workbench.view.extension.aws-consolas-reference-log')
    }
)

export const showSecurityScan = Commands.declare(
    'aws.consolas.security.scan',
    (context: ExtContext, securityPanelViewProvider: SecurityPanelViewProvider, client: DefaultConsolasClient) =>
        async () => {
            const editor = vscode.window.activeTextEditor
            if (editor) {
                const isSecurityScanKeyStarted =
                    context.extensionContext.globalState.get<boolean>(ConsolasConstants.codeScanStartedKey) || false
                if (!isSecurityScanKeyStarted) {
                    set(ConsolasConstants.codeScanStartedKey, true, context)
                    await vscode.commands.executeCommand('aws.consolas.refresh')
                    startSecurityScanWithProgress(securityPanelViewProvider, editor, client, context.extensionContext)
                }
            } else {
                vscode.window.showInformationMessage('Please open a file you want to scan to proceed.')
            }
        }
)

export function get(key: string, context: ExtContext): any {
    return context.extensionContext.globalState.get(key)
}

export function set(key: string, value: any, context: ExtContext): void {
    context.extensionContext.globalState.update(key, value).then(
        () => {},
        error => {
            getLogger().verbose(`Failed to update global state: ${error}`)
        }
    )
}
