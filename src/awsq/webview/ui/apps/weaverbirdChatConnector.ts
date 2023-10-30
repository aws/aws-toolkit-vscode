/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemFollowUp, ChatItemType, FeedbackPayload, Suggestion } from '@aws/mynah-ui-chat'
import { ExtensionMessage } from '../commands'
import { TabsStorage } from '../storages/tabsStorage'
import { CodeReference } from '../../../../codewhispererChat/view/connector/connector'

interface ChatPayload {
    chatMessage: string
    attachedAPIDocsSuggestion?: Suggestion
    attachedVanillaSuggestion?: Suggestion
}

export interface ConnectorProps {
    sendMessageToExtension: (message: ExtensionMessage) => void
    onMessageReceived?: (tabID: string, messageData: any, needToShowAPIDocsTab: boolean) => void
    onWriteCodeFollowUpClicked: (tabID: string, inProgress: boolean) => void
    onChatAnswerReceived?: (tabID: string, message: ChatItem) => void
    sendFeedback?: (tabId: string, feedbackPayload: FeedbackPayload) => void | undefined
    onError: (tabID: string, message: string, title: string) => void
    onWarning: (tabID: string, message: string, title: string) => void
    tabsStorage: TabsStorage
}

export class Connector {
    private readonly sendMessageToExtension
    private readonly onError
    private readonly onWarning
    private readonly onChatAnswerReceived
    private readonly onWriteCodeFollowUpClicked

    constructor(props: ConnectorProps) {
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onChatAnswerReceived = props.onChatAnswerReceived
        this.onWarning = props.onWarning
        this.onError = props.onError
        this.onWriteCodeFollowUpClicked = props.onWriteCodeFollowUpClicked
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
            codeReference,
            tabType: 'wb',
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
            codeReference,
            tabType: 'wb',
        })
    }

    onOpenDiff = (tabID: string, leftPath: string, rightPath: string): void => {
        this.sendMessageToExtension({
            command: 'open-diff',
            tabID,
            leftPath,
            rightPath,
            tabType: 'wb',
        })
    }

    followUpClicked = (tabID: string, followUp: ChatItemFollowUp): void => {
        this.sendMessageToExtension({
            command: 'follow-up-was-clicked',
            followUp,
            tabID,
            tabType: 'wb',
        })
    }

    requestGenerativeAIAnswer = (tabID: string, payload: ChatPayload): Promise<any> =>
        new Promise((resolve, reject) => {
            this.sendMessageToExtension({
                tabID: tabID,
                command: 'chat-prompt',
                chatMessage: payload.chatMessage,
                tabType: 'wb',
            })
        })

    private processChatMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived !== undefined) {
            const answer: ChatItem = {
                type: messageData.messageType,
                body: messageData.message ?? undefined,
                relatedContent: undefined,
                followUp:
                    messageData.followUps !== undefined && messageData.followUps.length > 0
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
                canBeVoted: true,
                // TODO get the backend to store a message id in addition to conversationID
                messageId: messageData.conversationID,
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

        if (messageData.type === 'codeGenerationMessage') {
            this.onWriteCodeFollowUpClicked(messageData.tabID, messageData.inProgress)
            return
        }
    }

    onStopChatResponse = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'stop-response',
        })
    }

    onTabOpen = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID,
            command: 'new-tab-was-created',
            tabType: 'wb',
        })
    }

    onTabRemove = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'tab-was-removed',
            tabType: 'wb',
        })
    }

    sendFeedback = (tabId: string, feedbackPayload: FeedbackPayload): void | undefined => {
        // TODO implement telemetry
    }
}
