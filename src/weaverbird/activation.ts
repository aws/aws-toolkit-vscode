/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { registerChatView } from './vue/chat/backend'

/**
 * Activate Weaverbird functionality for the extension.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const chatView = await registerChatView(context)

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
}
