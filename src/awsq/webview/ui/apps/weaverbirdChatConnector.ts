/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemFollowUp, ChatItemType, Suggestion } from '@aws/mynah-ui-chat'
import { MessageCommand } from '../commands'
import { TabType, TabTypeStorage } from '../storages/tabTypeStorage'

interface ChatPayload {
    chatMessage: string
    attachedAPIDocsSuggestion?: Suggestion
    attachedVanillaSuggestion?: Suggestion
}

export interface ConnectorProps {
    sendMessageToExtension: (message: Record<string, any>) => void
    onMessageReceived?: (tabID: string, messageData: any, needToShowAPIDocsTab: boolean) => void
    onChatAnswerReceived?: (tabID: string, message: ChatItem) => void
    onError: (tabID: string, message: string, title: string) => void
    onWarning: (tabID: string, message: string, title: string) => void
    tabTypeStorage: TabTypeStorage
}

export class Connector {
    private readonly sendMessageToExtension
    private readonly onError
    private readonly onWarning
    private readonly onChatAnswerReceived

    constructor(props: ConnectorProps) {
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onChatAnswerReceived = props.onChatAnswerReceived
        this.onWarning = props.onWarning
        this.onError = props.onError
    }

    onOpenDiff = (tabID: string, leftPath: string, rightPath: string): void => {
        this.sendMessageToExtension({
            command: MessageCommand.OPEN_DIFF,
            tabID,
            leftPath,
            rightPath,
            tabType: TabType.WeaverBird,
        })
    }

    followUpClicked = (tabID: string, followUp: ChatItemFollowUp): void => {
        this.sendMessageToExtension({
            command: MessageCommand.FOLLOW_UP_WAS_CLICKED,
            followUp,
            tabID,
            tabType: TabType.WeaverBird,
        })
    }

    requestGenerativeAIAnswer = (tabID: string, payload: ChatPayload): Promise<any> =>
        new Promise((resolve, reject) => {
            this.sendMessageToExtension({
                tabID: tabID,
                command: MessageCommand.CHAT_PROMPT,
                chatMessage: payload.chatMessage,
                tabType: TabType.WeaverBird,
            })
        })

    private processChatMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived !== undefined) {
            const answer: ChatItem = {
                type: messageData.messageType,
                body: messageData.message ?? undefined,
                relatedContent: undefined,
                followUp:
                    messageData.followUps !== undefined
                        ? {
                              text: 'Would you like to follow up with one of these?',
                              options: messageData.followUps,
                          }
                        : undefined,
            }
            this.onChatAnswerReceived(messageData.tabID, answer)
        }
    }

    private processFilePathMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived !== undefined) {
            const answer: ChatItem = {
                type: ChatItemType.CODE_RESULT,
                body: messageData.filePaths,
                relatedContent: undefined,
                followUp: undefined,
            }
            this.onChatAnswerReceived(messageData.tabID, answer)
        }
    }

    handleMessageReceive = async (messageData: any): Promise<void> => {
        if (messageData.type === 'errorMessage') {
            this.onError(messageData.tabID, messageData.message, messageData.title)
            return
        }

        if (messageData.type === 'showInvalidTokenNotification') {
            this.onWarning(messageData.tabID, messageData.message, messageData.title)
            return
        }

        if (messageData.type === 'chatMessage') {
            await this.processChatMessage(messageData)
            return
        }

        if (messageData.type === 'filePathMessage') {
            await this.processFilePathMessage(messageData)
            return
        }
    }
}
