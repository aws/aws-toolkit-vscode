/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../shared/vscode/commands2'
import { registerChatView } from './vue/chat/backend'

/**
 * Activate Weaverbird functionality for the extension.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const chatView = await registerChatView(context)
    context.subscriptions.push(
        Commands.register('aws.weaverbird.openChat', () => {
            console.log(chatView)
            chatView.onDidCreateContent.fire('I am a test')
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
}
