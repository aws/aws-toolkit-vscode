/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands, globals } from 'aws-core-vscode/shared'
import { window } from 'vscode'
import { AmazonQChatViewProvider } from './webviewProvider'
import { CodeScanIssue } from 'aws-core-vscode/codewhisperer'
import { EditorContextExtractor } from 'aws-core-vscode/codewhispererChat'

/**
 * TODO: Re-enable these once we can figure out which path they're going to live in
 * In hybrid chat mode they were being registered twice causing a registration error
 */
export function registerCommands(provider: AmazonQChatViewProvider) {
    globals.context.subscriptions.push(
        registerGenericCommand('aws.amazonq.explainCode', 'Explain', provider),
        registerGenericCommand('aws.amazonq.refactorCode', 'Refactor', provider),
        registerGenericCommand('aws.amazonq.fixCode', 'Fix', provider),
        registerGenericCommand('aws.amazonq.optimizeCode', 'Optimize', provider),
        registerGenericCommand('aws.amazonq.generateUnitTests', 'Generate Tests', provider),

        Commands.register('aws.amazonq.explainIssue', async (issue: CodeScanIssue) => {
            void focusAmazonQPanel().then(async () => {
                const editorContextExtractor = new EditorContextExtractor()
                const extractedContext = await editorContextExtractor.extractContextForTrigger('ContextMenu')
                const selectedCode =
                    extractedContext?.activeFileContext?.fileText
                        ?.split('\n')
                        .slice(issue.startLine, issue.endLine)
                        .join('\n') ?? ''

                // The message that gets sent to the UI
                const uiMessage = [
                    'Explain the ',
                    issue.title,
                    ' issue in the following code:',
                    '\n```\n',
                    selectedCode,
                    '\n```',
                ].join('')

                // The message that gets sent to the backend
                const contextMessage = `Explain the issue "${issue.title}" (${JSON.stringify(
                    issue
                )}) and generate code demonstrating the fix`

                void provider.webview?.postMessage({
                    command: 'sendToPrompt',
                    params: {
                        selection: '',
                        triggerType: 'contextMenu',
                        prompt: {
                            prompt: uiMessage, // what gets sent to the user
                            escapedPrompt: contextMessage, // what gets sent to the backend
                        },
                        autoSubmit: true,
                    },
                })
            })
        }),
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
        }),
        registerShellCommandShortCut('aws.amazonq.runCmdExecution', 'run-shell-command', provider),
        registerShellCommandShortCut('aws.amazonq.rejectCmdExecution', 'reject-shell-command', provider),
        registerShellCommandShortCut('aws.amazonq.stopCmdExecution', 'stop-shell-command', provider)
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
export async function focusAmazonQPanel() {
    await Commands.tryExecute('aws.amazonq.AmazonQChatView.focus')
    await Commands.tryExecute('aws.amazonq.AmazonCommonAuth.focus')
}

function registerShellCommandShortCut(commandName: string, buttonId: string, provider: AmazonQChatViewProvider) {
    return Commands.register(commandName, async () => {
        void focusAmazonQPanel().then(() => {
            void provider.webview?.postMessage({
                command: 'executeShellCommandShortCut',
                params: { id: buttonId },
            })
        })
    })
}
