/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { showView } from '../vue/backend'
import { ExtContext } from '../../shared/extensions'
import { Commands } from '../../shared/vscode/commands2'
import { CodeWhispererConstants } from '../models/constants'
import { getLogger } from '../../shared/logger'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { showAccessTokenPrompt } from '../util/showAccessTokenPrompt'
import { startSecurityScanWithProgress } from './startSecurityScan'
import { SecurityPanelViewProvider } from '../views/securityPanelViewProvider'
import { showTimedMessage } from '../../shared/utilities/messages'
import { Cloud9AccessState, codeScanState } from '../models/model'
import * as codewhispererClient from '../client/codewhisperer'
import { sleep } from '../../shared/utilities/timeoutUtils'

export const toggleCodeSuggestions = Commands.declare(
    'aws.codeWhisperer.toggleCodeSuggestion',
    (context: ExtContext) => async () => {
        const autoTriggerEnabled: boolean = get(CodeWhispererConstants.autoTriggerEnabledKey, context) || false
        set(CodeWhispererConstants.autoTriggerEnabledKey, !autoTriggerEnabled, context)
        await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
    }
)

export const enableCodeSuggestions = Commands.declare(
    'aws.codeWhisperer.enableCodeSuggestions',
    (context: ExtContext) => async () => {
        showView(context.extensionContext)
    }
)

export const showIntroduction = Commands.declare(
    'aws.codeWhisperer.introduction',
    (context: ExtContext) => async () => {
        vscode.env.openExternal(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
    }
)

export const enterAccessToken = Commands.declare(
    'aws.codeWhisperer.enterAccessToken',
    (context: ExtContext, client: DefaultCodeWhispererClient) => async () => {
        const setToken = async (token: string) => {
            set(CodeWhispererConstants.accessToken, token, context)
            await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
            await vscode.commands.executeCommand('aws.codeWhisperer.enableCodeSuggestions')
        }
        await showAccessTokenPrompt(client, setToken)
    }
)

export const requestAccess = Commands.declare('aws.codeWhisperer.requestAccess', (context: ExtContext) => async () => {
    vscode.env.openExternal(vscode.Uri.parse(CodeWhispererConstants.previewSignupPortal))
})

export const requestAccessCloud9 = Commands.declare(
    'aws.codeWhisperer.requestAccessCloud9',
    (context: ExtContext) => async () => {
        if (get(CodeWhispererConstants.cloud9AccessStateKey, context) === Cloud9AccessState.RequestedAccess) {
            showTimedMessage(CodeWhispererConstants.cloud9AccessAlreadySent, 3000)
        } else {
            try {
                await vscode.commands.executeCommand('cloud9.codeWhispererRequestAccess')
                showTimedMessage(CodeWhispererConstants.cloud9AccessSent, 3000)
                set(CodeWhispererConstants.cloud9AccessStateKey, Cloud9AccessState.RequestedAccess, context)
            } catch (e) {
                getLogger().error(`Encountered error when requesting cloud9 access ${e}`)
                set(CodeWhispererConstants.cloud9AccessStateKey, Cloud9AccessState.NoAccess, context)
            }
        }
    }
)

export const updateCloud9TreeNodes = Commands.declare(
    { id: 'aws.codeWhisperer.updateCloud9TreeNodes', autoconnect: true },
    (context: ExtContext) => async () => {
        const client = new codewhispererClient.DefaultCodeWhispererClient()
        const state = context.extensionContext.globalState.get<number | undefined>(
            CodeWhispererConstants.cloud9AccessStateKey
        )
        if (state === Cloud9AccessState.HasAccess) {
            return
        }
        const testApiCall = async () => {
            try {
                await client.generateRecommendations({
                    fileContext: {
                        filename: 'c9.py',
                        programmingLanguage: {
                            languageName: 'python',
                        },
                        leftFileContent: 'print(',
                        rightFileContent: '',
                    },
                    maxResults: CodeWhispererConstants.maxRecommendations,
                })
            } catch (e) {
                getLogger().verbose(`Encountered error ${e} when running test API call`)
                return false
            }
            return true
        }

        try {
            for (let i = 0; i < 3; i++) {
                const result = await testApiCall()
                if (result) {
                    context.extensionContext.globalState.update(
                        CodeWhispererConstants.cloud9AccessStateKey,
                        Cloud9AccessState.HasAccess
                    )
                    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
                    return
                }
                sleep(1000)
            }
            if (state !== Cloud9AccessState.RequestedAccess) {
                context.extensionContext.globalState.update(
                    CodeWhispererConstants.cloud9AccessStateKey,
                    Cloud9AccessState.NoAccess
                )
            }
        } catch (e) {
            getLogger().error(`Error when updateCloud9TreeNodes ${e}`)
            context.extensionContext.globalState.update(
                CodeWhispererConstants.cloud9AccessStateKey,
                Cloud9AccessState.NoAccess
            )
        }
        await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
    }
)

export const showReferenceLog = Commands.declare(
    'aws.codeWhisperer.openReferencePanel',
    (context: ExtContext) => async () => {
        await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-reference-log')
    }
)

export const showSecurityScan = Commands.declare(
    'aws.codeWhisperer.security.scan',
    (context: ExtContext, securityPanelViewProvider: SecurityPanelViewProvider, client: DefaultCodeWhispererClient) =>
        async () => {
            const editor = vscode.window.activeTextEditor
            if (editor) {
                if (!codeScanState.running) {
                    codeScanState.running = true
                    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
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
