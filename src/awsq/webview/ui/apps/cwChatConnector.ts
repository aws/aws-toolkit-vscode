/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemFollowUp, ChatItemType, Suggestion } from '@aws/mynah-ui-chat'
import { ExtensionMessage } from '../commands'
import { TabsStorage } from '../storages/tabsStorage'
import { CodeReference } from '../../../../codewhispererChat/view/connector/connector'
import { FeedbackPayload } from '@aws/mynah-ui-chat'

interface ChatPayload {
    chatMessage: string
    chatCommand?: string
    attachedAPIDocsSuggestion?: Suggestion
    attachedVanillaSuggestion?: Suggestion
}

export interface ConnectorProps {
    sendMessageToExtension: (message: ExtensionMessage) => void
    onMessageReceived?: (tabID: string, messageData: any, needToShowAPIDocsTab: boolean) => void
    onChatAnswerReceived?: (tabID: string, message: ChatItem) => void
    onCWCContextCommandMessage: (message: ChatItem) => string
    onError: (tabID: string, message: string, title: string) => void
    onWarning: (tabID: string, message: string, title: string) => void
    tabsStorage: TabsStorage
}

export class Connector {
    private readonly sendMessageToExtension
    private readonly onError
    private readonly onWarning
    private readonly onChatAnswerReceived
    private readonly onCWCContextCommandMessage

    constructor(props: ConnectorProps) {
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onChatAnswerReceived = props.onChatAnswerReceived
        this.onWarning = props.onWarning
        this.onError = props.onError
        this.onCWCContextCommandMessage = props.onCWCContextCommandMessage
    }

    followUpClicked = (tabID: string, followUp: ChatItemFollowUp): void => {
        this.sendMessageToExtension({
            command: 'follow-up-was-clicked',
            followUp,
            tabID,
            tabType: 'cwc',
        })
    }

    onTabAdd = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'new-tab-was-created',
            tabType: 'cwc',
        })
    }

    onCodeInsertToCursorPosition = (
        tabID: string,
        code?: string,
        type?: 'selection' | 'block',
        codeReference?: CodeReference[]
    ): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            code,
            command: 'insert_code_at_cursor_position',
            tabType: 'cwc',
            insertionTargetType: type,
            codeReference,
        })
    }

    onCopyCodeToClipboard = (
        tabID: string,
        code?: string,
        type?: 'selection' | 'block',
        codeReference?: CodeReference[]
    ): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            code,
            command: 'code_was_copied_to_clipboard',
            tabType: 'cwc',
            insertionTargetType: type,
            codeReference,
        })
    }

    onTabRemove = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'tab-was-removed',
            tabType: 'cwc',
        })
    }

    onStopChatResponse = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'stop-response',
            tabType: 'cwc',
        })
    }

    onChatItemVoted = (tabID: string, messageId: string, vote: 'upvote' | 'downvote'): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'chat-item-voted',
            messageId,
            vote,
            tabType: 'cwc',
        })
    }
    onSendFeedback = (tabID: string, feedbackPayload: FeedbackPayload): void | undefined => {
        this.sendMessageToExtension({
            command: 'chat-item-feedback',
            ...feedbackPayload,
            tabType: 'cwc',
            tabID: tabID,
        })
    }

    requestGenerativeAIAnswer = (tabID: string, payload: ChatPayload): Promise<any> =>
        new Promise((resolve, reject) => {
            this.sendMessageToExtension({
                tabID: tabID,
                command: 'chat-prompt',
                chatMessage: payload.chatMessage,
                chatCommand: payload.chatCommand,
                tabType: 'cwc',
            })
        })

    clearChat = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'clear',
            chatMessage: '',
            tabType: 'cwc',
        })
    }

    private sendTriggerMessageProcessed = async (requestID: any): Promise<void> => {
        this.sendMessageToExtension({
            command: 'trigger-message-processed',
            requestID: requestID,
            tabType: 'cwc',
        })
    }

    private processEditorContextCommandMessage = async (messageData: any): Promise<void> => {
        const triggerTabID = this.onCWCContextCommandMessage({
            body: messageData.message,
            type: ChatItemType.PROMPT,
        })

        this.sendTriggerTabIDReceived(messageData.triggerID, triggerTabID)
    }

    private sendTriggerTabIDReceived = async (triggerID: string, tabID: string): Promise<void> => {
        this.sendMessageToExtension({
            command: 'trigger-tabID-received',
            triggerID,
            tabID,
            tabType: 'cwc',
        })
    }

    private processChatMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived === undefined) {
            return
        }
        if (
            messageData.message !== undefined ||
            messageData.relatedSuggestions !== undefined ||
            messageData.codeReference !== undefined
        ) {
            const followUps =
                messageData.followUps !== undefined && messageData.followUps.length > 0
                    ? {
                          text: 'Would you like to follow up with one of these?',
                          options: messageData.followUps,
                      }
                    : undefined

            const answer: ChatItem = {
                type: messageData.messageType,
                messageId: messageData.messageID ?? messageData.triggerID,
                body: messageData.message,
                followUp: followUps,
                canBeVoted: true,
                codeReference: messageData.codeReference,
            }

            // If it is not there we will not set it
            if (messageData.messageType === 'answer-part' || messageData.messageType === 'answer') {
                answer.canBeVoted = true
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

            return
        }
        if (messageData.messageType === ChatItemType.ANSWER) {
            const answer: ChatItem = {
                type: messageData.messageType,
                body: undefined,
                relatedContent: undefined,
                codeReference: messageData.codeReference,
                followUp:
                    messageData.followUps !== undefined && messageData.followUps.length > 0
                        ? {
                              text: 'Would you like to follow up with one of these?',
                              options: messageData.followUps,
                          }
                        : undefined,
            }
            this.onChatAnswerReceived(messageData.tabID, answer)

            return
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

        if (messageData.type === 'editorContextCommandMessage') {
            await this.processEditorContextCommandMessage(messageData)
            return
        }
    }
}
