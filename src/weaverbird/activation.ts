/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { registerChatView } from './vue/chat/backend'
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
