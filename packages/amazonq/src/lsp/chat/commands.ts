/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands, globals } from 'aws-core-vscode/shared'
import { window } from 'vscode'
import { AmazonQChatViewProvider } from './webviewProvider'
import { CodeScanIssue } from 'aws-core-vscode/codewhisperer'
import * as vscode from 'vscode'
import * as path from 'path'

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

        Commands.register('aws.amazonq.explainIssue', (issue: CodeScanIssue, filePath: string) =>
            handleIssueCommand(
                issue,
                filePath,
                'Explain',
                'Provide a small description of the issue. You must not attempt to fix the issue. You should only give a small summary of it to the user.',
                provider
            )
        ),
        Commands.register('aws.amazonq.generateFix', (issue: CodeScanIssue, filePath: string) =>
            handleIssueCommand(
                issue,
                filePath,
                'Fix',
                'Generate a fix for the following code issue. You must not explain the issue, just generate and explain the fix. The user should have the option to accept or reject the fix before any code is changed.',
                provider
            )
        ),
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

async function handleIssueCommand(
    issue: CodeScanIssue,
    filePath: string,
    action: string,
    contextPrompt: string,
    provider: AmazonQChatViewProvider
) {
    await focusAmazonQPanel()

    if (issue && filePath) {
        await openFileWithSelection(issue, filePath)
    }

    const lineRange = createLineRangeText(issue)
    const visibleMessageInChat = `_${action} **${issue.title}** issue in **${path.basename(filePath)}** at \`${lineRange}\`_`
    const contextMessage = `${contextPrompt} Code issue - ${JSON.stringify(issue)}`

    void provider.webview?.postMessage({
        command: 'sendToPrompt',
        params: {
            selection: '',
            triggerType: 'contextMenu',
            prompt: {
                prompt: visibleMessageInChat,
                escapedPrompt: contextMessage,
            },
            autoSubmit: true,
        },
    })
}

async function openFileWithSelection(issue: CodeScanIssue, filePath: string) {
    const range = new vscode.Range(issue.startLine, 0, issue.endLine, 0)
    const doc = await vscode.workspace.openTextDocument(filePath)
    await vscode.window.showTextDocument(doc, {
        selection: range,
        viewColumn: vscode.ViewColumn.One,
        preview: true,
    })
}

function createLineRangeText(issue: CodeScanIssue): string {
    return issue.startLine === issue.endLine - 1
        ? `[${issue.startLine + 1}]`
        : `[${issue.startLine + 1}, ${issue.endLine}]`
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
    return Commands.register(commandName, async (data) => {
        const triggerType = getCommandTriggerType(data)
        const selection = getSelectedText()

        await focusAmazonQPanel()
        void provider.webview?.postMessage({
            command: 'genericCommand',
            params: { genericCommand, selection, triggerType },
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
                command: 'aws/chat/executeShellCommandShortCut',
                params: { id: buttonId },
            })
        })
    })
}
