/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemAction, ChatItemType, FeedbackPayload } from '@aws/mynah-ui'
import { ExtensionMessage } from '../commands'
import { CodeReference } from './amazonqCommonsConnector'
import { TabOpenType, TabsStorage, TabType } from '../storages/tabsStorage'
import { FollowUpGenerator } from '../followUps/generator'
import { CWCChatItem } from '../connector'

interface ChatPayload {
    chatMessage: string
    chatCommand?: string
}

export interface BaseConnectorProps {
    sendMessageToExtension: (message: ExtensionMessage) => void
    onMessageReceived?: (tabID: string, messageData: any, needToShowAPIDocsTab: boolean) => void
    onChatAnswerReceived?: (tabID: string, message: CWCChatItem | ChatItem, messageData: any) => void
    onError: (tabID: string, message: string, title: string) => void
    onWarning: (tabID: string, message: string, title: string) => void
    onOpenSettingsMessage: (tabID: string) => void
    tabsStorage: TabsStorage
}

export abstract class BaseConnector {
    protected readonly sendMessageToExtension
    protected readonly onError
    protected readonly onWarning
    protected readonly onChatAnswerReceived
    protected readonly onOpenSettingsMessage
    protected readonly followUpGenerator: FollowUpGenerator
    protected readonly tabsStorage

    abstract getTabType(): TabType

    constructor(props: BaseConnectorProps) {
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onChatAnswerReceived = props.onChatAnswerReceived
        this.onWarning = props.onWarning
        this.onError = props.onError
        this.onOpenSettingsMessage = props.onOpenSettingsMessage
        this.tabsStorage = props.tabsStorage
        this.followUpGenerator = new FollowUpGenerator()
    }

    onResponseBodyLinkClick = (tabID: string, messageId: string, link: string): void => {
        this.sendMessageToExtension({
            command: 'response-body-link-click',
            tabID,
            messageId,
            link,
            tabType: this.getTabType(),
        })
    }
    onInfoLinkClick = (tabID: string, link: string): void => {
        this.sendMessageToExtension({
            command: 'footer-info-link-click',
            tabID,
            link,
            tabType: this.getTabType(),
        })
    }

    followUpClicked = (tabID: string, messageId: string, followUp: ChatItemAction): void => {
        /**
         * We've pressed on a followup button and should start watching that round trip telemetry
         */
        this.sendMessageToExtension({
            command: 'start-chat-message-telemetry',
            trigger: 'followUpClicked',
            tabID,
            traceId: messageId,
            tabType: this.getTabType(),
            startTime: Date.now(),
        })
        this.sendMessageToExtension({
            command: 'follow-up-was-clicked',
            followUp,
            tabID,
            messageId,
            tabType: this.getTabType(),
        })
    }

    onTabAdd = (tabID: string, tabOpenInteractionType?: TabOpenType): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'new-tab-was-created',
            tabType: this.getTabType(),
            tabOpenInteractionType,
        })
    }

    onCodeInsertToCursorPosition = (
        tabID: string,
        messageId: string,
        code?: string,
        type?: 'selection' | 'block',
        codeReference?: CodeReference[],
        eventId?: string,
        codeBlockIndex?: number,
        totalCodeBlocks?: number,
        userIntent?: string,
        codeBlockLanguage?: string
    ): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            messageId,
            code,
            command: 'insert_code_at_cursor_position',
            tabType: this.getTabType(),
            insertionTargetType: type,
            codeReference,
            eventId,
            codeBlockIndex,
            totalCodeBlocks,
            userIntent,
            codeBlockLanguage,
        })
    }

    onCopyCodeToClipboard = (
        tabID: string,
        messageId: string,
        code?: string,
        type?: 'selection' | 'block',
        codeReference?: CodeReference[],
        eventId?: string,
        codeBlockIndex?: number,
        totalCodeBlocks?: number,
        userIntent?: string,
        codeBlockLanguage?: string
    ): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            messageId,
            code,
            command: 'code_was_copied_to_clipboard',
            tabType: this.getTabType(),
            insertionTargetType: type,
            codeReference,
            eventId,
            codeBlockIndex,
            totalCodeBlocks,
            userIntent,
            codeBlockLanguage,
        })
    }

    onTabRemove = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'tab-was-removed',
            tabType: this.getTabType(),
        })
    }

    onTabChange = (tabID: string, prevTabID?: string) => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'tab-was-changed',
            tabType: this.getTabType(),
            prevTabID,
        })
    }

    onStopChatResponse = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'stop-response',
            tabType: this.getTabType(),
        })
    }

    onChatItemVoted = (tabID: string, messageId: string, vote: 'upvote' | 'downvote'): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'chat-item-voted',
            messageId,
            vote,
            tabType: this.getTabType(),
        })
    }
    onSendFeedback = (tabID: string, feedbackPayload: FeedbackPayload): void | undefined => {
        this.sendMessageToExtension({
            command: 'chat-item-feedback',
            ...feedbackPayload,
            tabType: this.getTabType(),
            tabID: tabID,
        })
    }

    requestGenerativeAIAnswer = (tabID: string, messageId: string, payload: ChatPayload): Promise<any> => {
        /**
         * When a user presses "enter" send an event that indicates
         * we should start tracking the round trip time for this message
         **/
        this.sendMessageToExtension({
            command: 'start-chat-message-telemetry',
            trigger: 'onChatPrompt',
            tabID,
            traceId: messageId,
            tabType: this.getTabType(),
            startTime: Date.now(),
        })
        return new Promise((resolve, reject) => {
            this.sendMessageToExtension({
                tabID: tabID,
                command: 'chat-prompt',
                chatMessage: payload.chatMessage,
                chatCommand: payload.chatCommand,
                tabType: this.getTabType(),
            })
        })
    }

    clearChat = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'clear',
            chatMessage: '',
            tabType: this.getTabType(),
        })
    }

    help = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'help',
            chatMessage: '',
            tabType: this.getTabType(),
        })
    }

    onTabOpen = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID,
            command: 'new-tab-was-created',
            tabType: this.getTabType(),
        })
    }

    protected sendTriggerMessageProcessed = async (requestID: any): Promise<void> => {
        this.sendMessageToExtension({
            command: 'trigger-message-processed',
            requestID: requestID,
            tabType: this.getTabType(),
        })
    }

    protected processAuthNeededException = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived === undefined) {
            return
        }

        this.onChatAnswerReceived(
            messageData.tabID,
            {
                type: ChatItemType.ANSWER,
                messageId: messageData.triggerID,
                body: messageData.message,
                followUp: this.followUpGenerator.generateAuthFollowUps(this.getTabType(), messageData.authType),
                canBeVoted: false,
            },
            messageData
        )

        return
    }

    protected processOpenSettingsMessage = async (messageData: any): Promise<void> => {
        this.onOpenSettingsMessage(messageData.tabID)
    }

    protected baseHandleMessageReceive = async (messageData: any): Promise<void> => {
        if (messageData.type === 'errorMessage') {
            this.onError(messageData.tabID, messageData.message, messageData.title)
            return
        }
        if (messageData.type === 'showInvalidTokenNotification') {
            this.onWarning(messageData.tabID, messageData.message, messageData.title)
            return
        }

        if (messageData.type === 'authNeededException') {
            await this.processAuthNeededException(messageData)
            return
        }

        if (messageData.type === 'openSettingsMessage') {
            await this.processOpenSettingsMessage(messageData)
            return
        }
    }
}
