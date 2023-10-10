/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { Messenger } from './messenger/messenger'
import { ChatSessionStorage } from '../../storages/chatSession'
import { MessagePublisher } from '../../../awsq/messages/messagePublisher'
import { AppToWebViewMessageDispatcher } from '../../views/connector/connector'
import { FollowUpTypes, SessionStatePhase } from '../../types'
import { ChatItemFollowUp } from '@aws/mynah-ui-chat'

export interface ChatControllerEventEmitters {
    readonly processHumanChatMessage: EventEmitter<any>
    readonly followUpClicked: EventEmitter<any>
}

export class WeaverbirdController {
    private readonly messenger: Messenger
    private readonly sessionStorage: ChatSessionStorage

    public constructor(
        private readonly chatControllerInputEventEmitter: ChatControllerEventEmitters,
        appsToWebViewMessagePublisher: MessagePublisher<any>
    ) {
        this.messenger = new Messenger(new AppToWebViewMessageDispatcher(appsToWebViewMessagePublisher))
        this.sessionStorage = new ChatSessionStorage(this.messenger)

        this.chatControllerInputEventEmitter.processHumanChatMessage.event(data => {
            this.processHumanChatMessage(data)
        })
        this.chatControllerInputEventEmitter.followUpClicked.event(data => {
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
            }
        })
    }

    // TODO add type
    private async processHumanChatMessage(message: any) {
        if (message.message == undefined) {
            this.messenger.sendErrorMessage('chatMessage should be set', message.tabID)
            return
        }

        try {
            const session = await this.sessionStorage.getSession(message.tabID)
            const interactions = await session.send(message.message)

            for (const content of interactions.content) {
                this.messenger.sendResponse(
                    {
                        message: content,
                        followUps: this.getFollowUpOptions(session.state.phase),
                    },
                    message.tabID
                )
            }
        } catch (err: any) {
            const errorMessage = `Weaverbird API request failed: ${err.cause?.message ?? err.message}`
            this.messenger.sendErrorMessage(errorMessage, message.tabID)
        }
    }

    // TODO add type
    private async writeCodeClicked(message: any) {
        try {
            const session = await this.sessionStorage.getSession(message.tabID)
            await session.startCodegen()

            // Only add the follow up when the tab hasn't been closed/request hasn't been cancelled
            if (!session.state.tokenSource.token.isCancellationRequested) {
                this.messenger.sendResponse(
                    {
                        followUps: this.getFollowUpOptions(session.state.phase),
                    },
                    message.tabID
                )
            }
        } catch (err: any) {
            const errorMessage = `Weaverbird API request failed: ${err.cause?.message ?? err.message}`
            this.messenger.sendErrorMessage(errorMessage, message.tabID)
        }
    }

    // TODO add type
    private async acceptCode(message: any) {
        try {
            const session = await this.sessionStorage.getSession(message.tabID)
            await session.acceptChanges()
        } catch (err: any) {
            this.messenger.sendErrorMessage(`Failed to accept code changes: ${err.message}`, message.tabID)
        }
    }

    private getFollowUpOptions(phase: SessionStatePhase | undefined): ChatItemFollowUp[] {
        switch (phase) {
            case SessionStatePhase.Approach:
                return [
                    {
                        pillText: 'Write Code',
                        type: FollowUpTypes.WriteCode,
                    },
                ]
            case SessionStatePhase.Codegen:
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
}
