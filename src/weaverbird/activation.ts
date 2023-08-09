/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { TextDocumentShowOptions } from 'vscode'

import { Commands } from '../shared/vscode/commands2'
import { registerChatView } from './vue/chat/backend'
import { applyPatch } from 'diff'
import { readFileAsString } from '../shared/filesystemUtilities'
import Diff = require('diff')
import { writeFileSync } from 'fs-extra'
import { Storage } from './storage'

/**
 * Activate Weaverbird functionality for the extension.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const weaverbirdStorage = new Storage()

    // For testing, undefine WeaverbirdSessionStorage everytime
    weaverbirdStorage.memento.update('WeaverbirdSessionStorage', undefined)
    await weaverbirdStorage.createSessionStorage()

    const sessionId = await weaverbirdStorage.createSession()

    // Create some default session history
    await weaverbirdStorage.updateSession(sessionId, {
        name: 'testing',
        history: [
            'some example message from the user',
            'some example message from the LLM',
            'some example message from the user',
            'some example message from the LLM',
        ],
    })
    const currentSession = weaverbirdStorage.getSessionById(weaverbirdStorage.getSessionStorage(), sessionId)
    const chatView = await registerChatView(context, currentSession.history)

    context.subscriptions.push(
        Commands.register('aws.weaverbird.openChat', () => {
            console.log(chatView)
            chatView.onDidCreateContent.fire('I am a test')
        })
    )

    context.subscriptions.push(
        Commands.register('aws.weaverbird.applyPatch', async () => {
            // Note this patch is specifically for the weaverbird-poc project. Theres no point of trying to apply it to any other projects
            const selection = await vscode.window.showInformationMessage(
                'Code has been generated for session id: 1234',
                'Apply diff'
            )
            if (selection !== undefined && selection === 'Apply diff') {
                const testFilePath = path.join(chatView.session.workspaceRoot, 'src', 'App.tsx')
                const testFileContents = await readFileAsString(testFilePath)
                const patch = Diff.createPatch(
                    `App.tsx`,
                    testFileContents,
                    testFileContents.replace('Learn React', 'Diff has been applied!')
                )

                const appliedPatchResult = applyPatch(testFileContents, patch)
                writeFileSync(testFilePath, appliedPatchResult)
            }
        })
    )

    const commentController = vscode.comments.createCommentController(
        'aws.weaverbird.comment-controller',
        'Weaverbird Chat'
    )
    context.subscriptions.push(commentController)

    commentController.commentingRangeProvider = {
        provideCommentingRanges: (document: vscode.TextDocument, token: vscode.CancellationToken) => {
            const lineCount = document.lineCount
            return [new vscode.Range(0, 0, lineCount - 1, 0)]
        },
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('aws.weaverbird.chat.submit', (comment: vscode.CommentReply) => {
            const lineMessage = `On line ${comment.thread.range.start.line} in ${comment.thread.uri}: ${comment.text}`
            chatView.onDidCreateContent.fire(lineMessage)
            comment.thread.dispose()
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('aws.weaverbird.chat.showProgress', () => {
            chatView.onDidSubmitPlan.fire()
        })
    )

    /**
     * Start
     * Message
     * End
     */
    chatView.onDidSubmitPlan.event(() => {
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Weaverbird Progress Update',
                cancellable: true,
            },
            (progress, token) => {
                progress.report({
                    message: 'Starting to execute plan',
                })

                chatView.session.onProgressEvent(message => {
                    progress.report({
                        message,
                    })
                })

                // Temporary progress to call the commands
                setTimeout(() => {
                    chatView.session.onProgressEventEmitter.fire('Continuing to execute the plan')
                }, 2000)

                setTimeout(() => {
                    chatView.session.onProgressFinishedEventEmitter.fire()
                }, 6000)

                return new Promise<void>(resolve => {
                    chatView.session.onProgressFinishedEvent(() => {
                        resolve()
                    })
                })
            }
        )
    })

    const f = await vscode.workspace.findFiles('**/*.js', '**​/node_modules/**', 5)
    await vscode.commands.executeCommand('vscode.diff', f[0], f[1], undefined, {
        viewColumn: vscode.ViewColumn.Active,
        preview: false,
        preserveFocus: false,
    } as TextDocumentShowOptions)

    const myScheme = 'test'
    const myProvider = new (class implements vscode.TextDocumentContentProvider {
        // emitter and its event
        onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>()
        onDidChange = this.onDidChangeEmitter.event

        provideTextDocumentContent(uri: vscode.Uri): string {
            return 'sample file contents'
        }
    })()
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(myScheme, myProvider))

    const uri = vscode.Uri.parse('test:testfile')
    const doc = await vscode.workspace.openTextDocument(uri) // calls back into the provider
    await vscode.commands.executeCommand('vscode.diff', f[2], doc.uri, undefined, {
        viewColumn: vscode.ViewColumn.One,
        preview: false,
        preserveFocus: false,
    } as TextDocumentShowOptions)
}
