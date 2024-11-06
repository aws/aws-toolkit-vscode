/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class is responsible for listening to and processing events
 * from the webview and translating them into events to be handled by the extension,
 * and events from the extension and translating them into events to be handled by the webview.
 */

import { ChatItem, ChatItemType } from '@aws/mynah-ui'
import { TabType } from '../storages/tabsStorage'
import { GumbyMessageType } from '../../../../amazonqGumby/chat/views/connector/connector'
import { ChatPayload } from '../connector'
import { BaseConnector, BaseConnectorProps } from './baseConnector'

export interface ConnectorProps extends BaseConnectorProps {
    onAsyncEventProgress: (
        tabID: string,
        inProgress: boolean,
        message: string,
        messageId: string,
        enableStopAction: boolean
    ) => void
    onChatAnswerUpdated?: (tabID: string, message: ChatItem) => void
    onQuickHandlerCommand: (tabID: string, command: string, eventId?: string) => void
    onUpdateAuthentication: (gumbyEnabled: boolean, authenticatingTabIDs: string[]) => void
    onChatInputEnabled: (tabID: string, enabled: boolean) => void
    onUpdatePlaceholder: (tabID: string, newPlaceholder: string) => void
}

export interface MessageData {
    tabID: string
    type: GumbyMessageType
}

export class Connector extends BaseConnector {
    private readonly onAuthenticationUpdate
    private readonly onChatAnswerUpdated
    private readonly chatInputEnabled
    private readonly onAsyncEventProgress
    private readonly onQuickHandlerCommand
    private readonly updatePlaceholder

    override getTabType(): TabType {
        return 'gumby'
    }

    constructor(props: ConnectorProps) {
        super(props)
        this.onChatAnswerUpdated = props.onChatAnswerUpdated
        this.chatInputEnabled = props.onChatInputEnabled
        this.onAsyncEventProgress = props.onAsyncEventProgress
        this.updatePlaceholder = props.onUpdatePlaceholder
        this.onQuickHandlerCommand = props.onQuickHandlerCommand
        this.onAuthenticationUpdate = props.onUpdateAuthentication
    }

    private processChatPrompt = async (messageData: any, tabID: string): Promise<void> => {
        if (this.onChatAnswerReceived === undefined) {
            return
        }

        const answer: ChatItem = {
            type: ChatItemType.AI_PROMPT,
            body: messageData.message,
            formItems: messageData.formItems,
            buttons: messageData.formButtons,
            followUp: undefined,
            status: 'info',
            canBeVoted: false,
        }

        this.onChatAnswerReceived(tabID, answer, messageData)

        return
    }

    private processChatMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived === undefined || this.onChatAnswerUpdated === undefined) {
            return
        }

        if (messageData.message !== undefined) {
            const answer: ChatItem = {
                type: messageData.messageType,
                messageId: messageData.messageId ?? messageData.triggerID,
                body: messageData.message,
                buttons: messageData.buttons ?? [],
                canBeVoted: false,
            }

            if (messageData.messageId !== undefined) {
                this.onChatAnswerUpdated(messageData.tabID, answer)
                return
            }

            this.onChatAnswerReceived(messageData.tabID, answer, messageData)
        }
    }

    transform = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'transform',
            chatMessage: 'transform',
            tabType: this.getTabType(),
        })
    }

    requestAnswer = (tabID: string, payload: ChatPayload) => {
        this.tabsStorage.updateTabStatus(tabID, 'busy')
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'chat-prompt',
            chatMessage: payload.chatMessage,
            chatCommand: payload.chatCommand,
            tabType: this.getTabType(),
        })
    }

    onCustomFormAction(
        tabId: string,
        action: {
            id: string
            text?: string | undefined
            formItemValues?: Record<string, string> | undefined
        }
    ) {
        if (action === undefined) {
            return
        }

        this.sendMessageToExtension({
            command: 'form-action-click',
            action: action.id,
            formSelectedValues: action.formItemValues,
            tabType: this.getTabType(),
            tabID: tabId,
        })
    }

    private processExecuteCommand = async (messageData: any): Promise<void> => {
        this.onQuickHandlerCommand(messageData.tabID, messageData.command, messageData.eventId)
    }

    // This handles messages received from the extension, to be forwarded to the webview
    handleMessageReceive = async (messageData: { type: GumbyMessageType } & Record<string, any>) => {
        switch (messageData.type) {
            case 'asyncEventProgressMessage':
                this.onAsyncEventProgress(
                    messageData.tabID,
                    messageData.inProgress,
                    messageData.message,
                    messageData.messageId,
                    false
                )
                break
            case 'authenticationUpdateMessage':
                this.onAuthenticationUpdate(messageData.gumbyEnabled, messageData.authenticatingTabIDs)
                break
            case 'chatInputEnabledMessage':
                this.chatInputEnabled(messageData.tabID, messageData.enabled)
                break
            case 'chatMessage':
                await this.processChatMessage(messageData)
                break
            case 'chatPrompt':
                await this.processChatPrompt(messageData, messageData.tabID)
                break
            case 'sendCommandMessage':
                await this.processExecuteCommand(messageData)
                break
            case 'updatePlaceholderMessage':
                this.updatePlaceholder(messageData.tabID, messageData.newPlaceholder)
                break
            default:
                await this.baseHandleMessageReceive(messageData)
        }
    }
}
