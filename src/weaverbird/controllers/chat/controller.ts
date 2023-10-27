/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { existsSync } from 'fs'
import { EventEmitter } from 'vscode'
import { Messenger } from './messenger/messenger'
import { ChatSessionStorage } from '../../storages/chatSession'
import { FollowUpTypes, SessionStatePhase } from '../../types'
import { ChatItemFollowUp } from '@aws/mynah-ui-chat'
import { weaverbirdScheme } from '../../constants'
import { defaultRetryLimit } from '../../limits'
import { Session } from '../../session/session'

export interface ChatControllerEventEmitters {
    readonly processHumanChatMessage: EventEmitter<any>
    readonly followUpClicked: EventEmitter<any>
    readonly openDiff: EventEmitter<any>
    readonly stopResponse: EventEmitter<any>
    readonly tabClosed: EventEmitter<any>
}

export class WeaverbirdController {
    private readonly messenger: Messenger
    private readonly sessionStorage: ChatSessionStorage

    public constructor(
        private readonly chatControllerMessageListeners: ChatControllerEventEmitters,
        messenger: Messenger,
        sessionStorage: ChatSessionStorage
    ) {
        this.messenger = messenger
        this.sessionStorage = sessionStorage

        this.chatControllerMessageListeners.processHumanChatMessage.event(data => {
            this.processHumanChatMessage(data)
        })
        this.chatControllerMessageListeners.followUpClicked.event(data => {
            switch (data.followUp.type) {
                case FollowUpTypes.WriteCode:
                    this.writeCodeClicked(data)
                    break
                case FollowUpTypes.AcceptCode:
                    this.acceptCode(data)
                    break
                case FollowUpTypes.RejectCode:
                    // TODO figure out what we want to do here
                    break
                case FollowUpTypes.Retry:
                    this.retryRequest(data)
            }
        })
        this.chatControllerMessageListeners.openDiff.event(data => {
            this.openDiff(data)
        })
        this.chatControllerMessageListeners.stopResponse.event(data => {
            this.stopResponse(data)
        })
        this.chatControllerMessageListeners.tabClosed.event(data => {
            this.tabClosed(data)
        })
    }

    // TODO add type
    private async processHumanChatMessage(message: any) {
        if (message.message == undefined) {
            this.messenger.sendErrorMessage('chatMessage should be set', message.tabID, 0)
            return
        }

        let session
        try {
            session = await this.sessionStorage.getSession(message.tabID)

            // Create the "..." bubbles
            this.messenger.sendAnswer({
                message: '',
                type: 'answer-stream',
                tabID: message.tabID,
            })

            const interactions = await session.send(message.message)

            // Resolve the "..." with the content
            this.messenger.sendAnswer({
                message: interactions.content,
                type: 'answer-part',
                tabID: message.tabID,
            })

            // Follow up with action items and complete the request stream
            this.messenger.sendAnswer({
                type: 'answer',
                followUps: this.getFollowUpOptions(session.state.phase),
                tabID: message.tabID,
            })
        } catch (err: any) {
            const errorMessage = `Weaverbird API request failed: ${err.cause?.message ?? err.message}`
            this.messenger.sendErrorMessage(errorMessage, message.tabID, this.retriesRemaining(session))
        }
    }

    // TODO add type
    private async writeCodeClicked(message: any) {
        // lock the UI/show loading bubbles
        this.messenger.sendCodeGeneration(message.tabID, true)

        let session
        let filePaths: string[] = []
        try {
            session = await this.sessionStorage.getSession(message.tabID)
            filePaths = await session.startCodegen()
        } catch (err: any) {
            const errorMessage = `Weaverbird API request failed: ${err.cause?.message ?? err.message}`
            this.messenger.sendErrorMessage(errorMessage, message.tabID, this.retriesRemaining(session))
        }

        // unlock the UI
        this.messenger.sendCodeGeneration(message.tabID, false)

        // send the file path changes
        if (filePaths.length > 0) {
            this.messenger.sendFilePaths(filePaths, message.tabID, session?.state.conversationId ?? '')
        }

        // Only add the follow up when the tab hasn't been closed/request hasn't been cancelled
        if (!session?.state.tokenSource.token.isCancellationRequested && filePaths.length > 0) {
            this.messenger.sendAnswer({
                message: undefined,
                type: 'answer',
                followUps: this.getFollowUpOptions(session?.state.phase),
                tabID: message.tabID,
            })
        }
    }

    // TODO add type
    private async acceptCode(message: any) {
        let session
        try {
            session = await this.sessionStorage.getSession(message.tabID)
            await session.acceptChanges()
        } catch (err: any) {
            this.messenger.sendErrorMessage(
                `Failed to accept code changes: ${err.message}`,
                message.tabID,
                this.retriesRemaining(session)
            )
        }
    }

    private async retryRequest(message: any) {
        let session
        try {
            session = await this.sessionStorage.getSession(message.tabID)

            // Decrease retries before making this request, just in case this one fails as well
            session.decreaseRetries()

            // Sending an empty message will re-run the last state with the previous values
            await session.send('')
        } catch (err: any) {
            this.messenger.sendErrorMessage(
                `Failed to retry request: ${err.message}`,
                message.tabID,
                this.retriesRemaining(session)
            )
        }
    }

    private getFollowUpOptions(phase: SessionStatePhase | undefined): ChatItemFollowUp[] {
        switch (phase) {
            case 'Approach':
                return [
                    {
                        pillText: 'Write Code',
                        type: FollowUpTypes.WriteCode,
                    },
                ]
            case 'Codegen':
                return [
                    {
                        pillText: 'Accept changes',
                        type: FollowUpTypes.AcceptCode,
                    },
                    {
                        pillText: 'Reject and discuss',
                        type: FollowUpTypes.RejectCode,
                    },
                ]
            default:
                return []
        }
    }

    private async openDiff(message: any) {
        const session = await this.sessionStorage.getSession(message.tabID)
        const workspaceRoot = session.config.workspaceRoot ?? ''
        const originalPath = path.join(workspaceRoot, message.rightPath)
        let left
        if (existsSync(originalPath)) {
            left = vscode.Uri.file(originalPath)
        } else {
            left = vscode.Uri.from({ scheme: weaverbirdScheme, path: 'empty', query: `tabID=${message.tabID}` })
        }

        vscode.commands.executeCommand(
            'vscode.diff',
            left,
            vscode.Uri.from({
                scheme: weaverbirdScheme,
                path: message.rightPath,
                query: `tabID=${message.tabID}`,
            })
        )
    }

    private async stopResponse(message: any) {
        const session = await this.sessionStorage.getSession(message.tabID)
        session.state.tokenSource.cancel()
    }

    private tabClosed(message: any) {
        this.sessionStorage.deleteSession(message.tabID)
    }

    private retriesRemaining(session: Session | undefined) {
        return session?.retries ?? defaultRetryLimit
    }
}
