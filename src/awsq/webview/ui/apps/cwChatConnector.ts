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

    followUpClicked = (tabID: string, followUp: ChatItemFollowUp): void => {
        this.sendMessageToExtension({
            command: MessageCommand.FOLLOW_UP_WAS_CLICKED,
            followUp,
            tabID,
            tabType: TabType.CodeWhispererChat,
        })
    }

    onTabAdd = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: MessageCommand.NEW_TAB_WAS_CREATED,
            tabType: TabType.CodeWhispererChat,
        })
    }

    onTabRemove = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: MessageCommand.TAB_WAS_REMOVED,
            tabType: TabType.CodeWhispererChat,
        })
    }

    requestGenerativeAIAnswer = (tabID: string, payload: ChatPayload): Promise<any> =>
        new Promise((resolve, reject) => {
            this.sendMessageToExtension({
                tabID: tabID,
                command: MessageCommand.CHAT_PROMPT,
                chatMessage: payload.chatMessage,
                tabType: TabType.CodeWhispererChat,
            })
        })

    private sendTriggerMessageProcessed = async (requestID: any): Promise<void> => {
        this.sendMessageToExtension({
            command: MessageCommand.TRIGGET_MESSAGE_PROCESSED,
            requestID: requestID,
            tabType: TabType.CodeWhispererChat,
        })
    }

    private processChatMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived !== undefined) {
            if (messageData.message !== undefined || messageData.relatedSuggestions !== undefined) {
                const followUps =
                    messageData.followUps !== undefined
                        ? {
                              text: 'Would you like to follow up with one of these?',
                              options: messageData.followUps,
                          }
                        : undefined

                const answer: ChatItem = {
                    type: messageData.messageType,
                    body:
                        messageData.message !== undefined
                            ? `<span markdown="1">${messageData.message}</span>`
                            : undefined,
                    followUp: followUps,
                }

                if (messageData.relatedSuggestions !== undefined) {
                    answer.relatedContent = {
                        title: 'Sources',
                        content: messageData.relatedSuggestions,
                    }
                }
                this.onChatAnswerReceived(messageData.tabID, answer)

                // Exit the function if we received an answer from AI
                if (
                    messageData.messageType === ChatItemType.SYSTEM_PROMPT ||
                    messageData.messageType === ChatItemType.AI_PROMPT
                ) {
                    await this.sendTriggerMessageProcessed(messageData.requestID)
                }
            } else if (messageData.messageType === ChatItemType.ANSWER) {
                const answer: ChatItem = {
                    type: messageData.messageType,
                    body: undefined,
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
    }
}
