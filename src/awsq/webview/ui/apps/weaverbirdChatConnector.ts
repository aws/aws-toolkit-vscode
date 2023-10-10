/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemType, Suggestion } from '@aws/mynah-ui-chat'

interface ChatPayload {
    chatMessage: string
    attachedAPIDocsSuggestion?: Suggestion
    attachedVanillaSuggestion?: Suggestion
}

export interface ConnectorProps {
    postMessageHandler: (message: Record<string, any>) => void
    onMessageReceived?: (tabID: string, messageData: any, needToShowAPIDocsTab: boolean) => void
    onChatAnswerReceived?: (tabID: string, message: ChatItem) => void
    onError: (tabID: string, message: string, title: string) => void
    onWarning: (tabID: string, message: string, title: string) => void
}

export class Connector {
    private readonly postMessageHandler
    private readonly onError
    private readonly onWarning
    private readonly onChatAnswerReceived

    constructor(props: ConnectorProps) {
        this.postMessageHandler = props.postMessageHandler
        this.onChatAnswerReceived = props.onChatAnswerReceived
        this.onWarning = props.onWarning
        this.onError = props.onError
    }

    requestGenerativeAIAnswer = (tabID: string, payload: ChatPayload): Promise<any> =>
        new Promise((resolve, reject) => {
            this.postMessageHandler({
                tabID: tabID,
                command: 'processChatMessage',
                chatMessage: payload.chatMessage,
                attachedAPIDocsSuggestion: payload.attachedAPIDocsSuggestion,
                attachedVanillaSuggestion: payload.attachedVanillaSuggestion,
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
