/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands, globals } from 'aws-core-vscode/shared'
import { window } from 'vscode'
import { AmazonQChatViewProvider } from './webviewProvider'

export function registerCommands(provider: AmazonQChatViewProvider) {
    globals.context.subscriptions.push(
        registerGenericCommand('aws.amazonq.explainCode', 'Explain', provider),
        registerGenericCommand('aws.amazonq.refactorCode', 'Refactor', provider),
        registerGenericCommand('aws.amazonq.fixCode', 'Fix', provider),
        registerGenericCommand('aws.amazonq.optimizeCode', 'Optimize', provider),
        Commands.register('aws.amazonq.sendToPrompt', (data) => {
            const triggerType = getCommandTriggerType(data)
            const selection = getSelectedText()

            void focusAmazonQPanel().then(() => {
                void provider.webview?.postMessage({
                    command: 'sendToPrompt',
                    params: { selection: selection, triggerType },
                })
            })
        }),
        Commands.register('aws.amazonq.openTab', () => {
            void focusAmazonQPanel().then(() => {
                void provider.webview?.postMessage({
                    command: 'aws/chat/openTab',
                    params: {},
                })
            })
        })
    )
}

function getSelectedText(): string {
    const editor = window.activeTextEditor
    if (editor) {
        const selection = editor.selection
        const selectedText = editor.document.getText(selection)
        return selectedText
    }

    return ' '
}

function getCommandTriggerType(data: any): string {
    // data is undefined when commands triggered from keybinding or command palette. Currently no
    // way to differentiate keybinding and command palette, so both interactions are recorded as keybinding
    return data === undefined ? 'hotkeys' : 'contextMenu'
}

function registerGenericCommand(commandName: string, genericCommand: string, provider: AmazonQChatViewProvider) {
    return Commands.register(commandName, (data) => {
        const triggerType = getCommandTriggerType(data)
        const selection = getSelectedText()

        void focusAmazonQPanel().then(() => {
            void provider.webview?.postMessage({
                command: 'genericCommand',
                params: { genericCommand, selection, triggerType },
            })
        })
    })
}

/**
 * Importing focusAmazonQPanel from aws-core-vscode/amazonq leads to several dependencies down the chain not resolving since AmazonQ chat
 * is currently only activated on node, but the language server is activated on both web and node.
 *
 * Instead, we just create our own as a temporary solution
 */
async function focusAmazonQPanel() {
    await Commands.tryExecute('aws.amazonq.AmazonQChatView.focus')
    await Commands.tryExecute('aws.amazonq.AmazonCommonAuth.focus')
}
