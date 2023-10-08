/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemType, Suggestion, SuggestionEngagement } from '@aws/mynah-ui-chat'

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
    private readonly onMessageReceived
    private readonly onError
    private readonly onWarning
    private readonly onChatAnswerReceived

    private isUIReady = false

    private searchId = undefined

    constructor(props: ConnectorProps) {
        this.postMessageHandler = props.postMessageHandler
        this.onMessageReceived = props.onMessageReceived
        this.onChatAnswerReceived = props.onChatAnswerReceived
        this.onWarning = props.onWarning
        this.onError = props.onError
    }

    requestGenerativeAIAnswer = (tabID: string, payload: ChatPayload): Promise<any> =>
        new Promise((resolve, reject) => {
            if (this.isUIReady) {
                this.postMessageHandler({
                    searchId: this.searchId,
                    tabID: tabID,
                    command: 'processChatMessage',
                    chatMessage: payload.chatMessage,
                    attachedAPIDocsSuggestion: payload.attachedAPIDocsSuggestion,
                    attachedVanillaSuggestion: payload.attachedVanillaSuggestion,
                })
            } else {
                setTimeout(() => {
                    this.requestGenerativeAIAnswer(tabID, payload)
                }, 50)
                return
            }
        })

    private sendTriggerMessageProcessed = async (requestID: any): Promise<void> => {
        this.postMessageHandler({
            command: 'triggerMessageProcessed',
            requestID: requestID,
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
                    answer.suggestions = {
                        title: 'Web results',
                        suggestions: messageData.relatedSuggestions,
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

    handleMessageReceive = async (message: MessageEvent): Promise<void> => {
        // eslint-disable-next-line no-debugger
        if (message.data === undefined) {
            return
        }
        const messageData = JSON.parse(message.data)

        if (messageData !== undefined && messageData.sender === 'CWChat') {
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

    uiReady = (): void => {
        this.isUIReady = true
        this.postMessageHandler({
            command: 'uiReady',
        })
        if (this.onMessageReceived !== undefined) {
            window.addEventListener('message', this.handleMessageReceive.bind(this))
        }
    }

    triggerSuggestionEngagement = (engagement: SuggestionEngagement): void => {
        // let command: string = 'hoverSuggestion'
        // if (
        //     engagement.engagementType === EngagementType.INTERACTION &&
        //     engagement.selectionDistanceTraveled?.selectedText !== undefined
        // ) {
        //     command = 'selectSuggestionText'
        // }
        // this.postMessageHandler({
        //     command,
        //     searchId: this.searchId,
        //     suggestionId: engagement.suggestion.url,
        //     // suggestionRank: parseInt(engagement.suggestion.id),
        //     suggestionType: engagement.suggestion.type,
        //     selectedText: engagement.selectionDistanceTraveled?.selectedText,
        //     hoverDuration: engagement.engagementDurationTillTrigger / 1000, // seconds
        // })
    }
}
