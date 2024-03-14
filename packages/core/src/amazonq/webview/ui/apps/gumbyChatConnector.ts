/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class is responsible for listening to and processing events
 * from the webview and translating them into events to be handled by the extension,
 * and events from the extension and translating them into events to be handled by the webview.
 */

import { ChatItem, ChatItemType } from '@aws/mynah-ui'
import { ExtensionMessage } from '../commands'
import { TabOpenType, TabsStorage } from '../storages/tabsStorage'
import { ChatPrompt } from '../../../../amazonqGumby/chat/views/connector/connector'

export interface ConnectorProps {
    sendMessageToExtension: (message: ExtensionMessage) => void
    onMessageReceived?: (tabID: string, messageData: any, needToShowAPIDocsTab: boolean) => void
    onAsyncEventProgress: (tabID: string, inProgress: boolean, message: string, messageId: string) => void
    onChatAnswerReceived?: (tabID: string, message: ChatItem) => void
    onChatAnswerUpdated?: (tabID: string, message: ChatItem) => void
    onCWCContextCommandMessage: (message: ChatItem, command?: string) => string | undefined
    onError: (tabID: string, message: string, title: string) => void
    onWarning: (tabID: string, message: string, title: string) => void
    onUpdateAuthentication: (featureDevEnabled: boolean, authenticatingTabIDs: string[]) => void
    onChatInputEnabled: (tabID: string, enabled: boolean) => void
    tabsStorage: TabsStorage
}

export class Connector {
    private readonly sendMessageToExtension
    private readonly onError
    private readonly onChatAnswerReceived
    private readonly onChatAnswerUpdated
    private readonly chatInputEnabled
    private readonly onAsyncEventProgress
    private readonly onCWCContextCommandMessage

    constructor(props: ConnectorProps) {
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onChatAnswerReceived = props.onChatAnswerReceived
        this.onChatAnswerUpdated = props.onChatAnswerUpdated
        this.onError = props.onError
        this.chatInputEnabled = props.onChatInputEnabled
        this.onAsyncEventProgress = props.onAsyncEventProgress
        this.onCWCContextCommandMessage = props.onCWCContextCommandMessage
    }

    onTabAdd = (tabID: string, tabOpenInteractionType?: TabOpenType): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'new-tab-was-created',
            tabType: 'gumby',
            tabOpenInteractionType,
        })
    }

    onTabRemove(tabID: string) {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'tab-was-removed',
            tabType: 'gumby',
        })
    }

    private processChatPrompt = async (messageData: ChatPrompt, tabID: string): Promise<void> => {
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

        this.onChatAnswerReceived(tabID, answer)

        return
    }

    private processChatMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived === undefined || this.onChatAnswerUpdated === undefined) {
            return
        }

        console.log(
            `calling processChatMessage with message ${messageData.message} and messageId ${messageData.messageId}`
        )

        if (messageData.message !== undefined) {
            const answer: ChatItem = {
                type: messageData.messageType,
                messageId: messageData.messageId ?? messageData.triggerID,
                body: messageData.message,
                buttons: messageData.buttons ?? [],
                canBeVoted: false,
            }

            if (messageData.messageId !== undefined) {
                console.log('gumbyChatconnector: calling onChatAnswerUpdated')
                this.onChatAnswerUpdated(messageData.tabID, answer)
                return
            }

            this.onChatAnswerReceived(messageData.tabID, answer)
        }
    }

    transform = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'transform',
            chatMessage: 'transform',
            tabType: 'gumby',
        })
    }

    private processAuthNeededException = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived === undefined) {
            return
        }

        this.onChatAnswerReceived(messageData.tabID, {
            type: ChatItemType.SYSTEM_PROMPT,
            body: messageData.message,
        })

        return
    }

    // This handles messages received from the extension, to be forwarded to the webview
    handleMessageReceive = async (messageData: any): Promise<void> => {
        if (messageData.type === 'errorMessage') {
            this.onError(messageData.tabID, messageData.message, messageData.title)
            return
        }

        if (messageData.type === 'chatMessage') {
            await this.processChatMessage(messageData)
            return
        }

        if (messageData.type === 'authNeededException') {
            await this.processAuthNeededException(messageData)
            return
        }

        if (messageData.type === 'chatInputEnabledMessage') {
            this.chatInputEnabled(messageData.tabID, messageData.enabled)
            return
        }

        if (messageData.type === 'chatPrompt') {
            await this.processChatPrompt(messageData, messageData.tabID)
            return
        }

        if (messageData.type === 'asyncEventProgressMessage') {
            this.onAsyncEventProgress(
                messageData.tabID,
                messageData.inProgress,
                messageData.message,
                messageData.messageId
            )
            return
        }

        if (messageData.type === 'sendCommandMessage') {
            await this.processExecuteCommand(messageData)
            return
        }
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

        switch (action.id) {
            //todo[gumby]: forward this
            case 'gumbyJavaHomeFormCancel':
                break
            default:
                this.sendMessageToExtension({
                    command: 'form-action-click',
                    action: action.id,
                    formSelectedValues: action.formItemValues,
                    tabType: 'gumby',
                    tabId: tabId,
                })
                break
        }
    }

    private processExecuteCommand = async (messageData: any): Promise<void> => {
        this.onCWCContextCommandMessage(
            {
                body: messageData.message,
                type: ChatItemType.PROMPT,
            },
            messageData.command
        )
    }
}
