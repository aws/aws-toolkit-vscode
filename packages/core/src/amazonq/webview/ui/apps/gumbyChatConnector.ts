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
    onAsyncEventProgress: (tabID: string, inProgress: boolean, message: string) => void
    onChatAnswerReceived?: (tabID: string, message: ChatItem) => void
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
    private readonly chatInputEnabled
    private readonly onAsyncEventProgress
    private readonly onCWCContextCommandMessage

    constructor(props: ConnectorProps) {
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onChatAnswerReceived = props.onChatAnswerReceived
        this.onError = props.onError
        this.chatInputEnabled = props.onChatInputEnabled
        this.onAsyncEventProgress = props.onAsyncEventProgress
        this.onCWCContextCommandMessage = props.onCWCContextCommandMessage
    }

    onTabAdd = (tabID: string, tabOpenInteractionType?: TabOpenType): void => {
        console.log('calling onTabAdd in gumbyChatConnector')

        this.sendMessageToExtension({
            tabID: tabID,
            command: 'new-tab-was-created',
            tabType: 'gumby',
            tabOpenInteractionType,
        })
    }

    onTabRemove(tabID: string) {
        console.log('calling onTabRemove in gumbyChatConnector')

        this.sendMessageToExtension({
            tabID: tabID,
            command: 'tab-was-removed',
            tabType: 'gumby',
        })
    }

    private processChatPrompt = async (messageData: ChatPrompt, tabID: string): Promise<void> => {
        console.log(`callin processChatPrompt with ${tabID}`)
        if (this.onChatAnswerReceived === undefined) {
            console.log('onChatAnswerReceived is undefined')
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
        console.log(`callin processChatMessage with message ${messageData.message}`)
        if (this.onChatAnswerReceived === undefined) {
            return
        }

        if (messageData.message !== undefined) {
            console.log(`messageType is ${messageData.messageType}`)
            const answer: ChatItem = {
                type: messageData.messageType,
                messageId: messageData.messageID ?? messageData.triggerID,
                body: messageData.message,
                buttons: messageData.buttons ?? [],
                canBeVoted: false,
            }

            this.onChatAnswerReceived(messageData.tabID, answer)

            return
        }

        if (messageData.messageType === ChatItemType.ANSWER) {
            const answer: ChatItem = {
                type: messageData.messageType,
                body: undefined,
                relatedContent: undefined,
                messageId: messageData.messageID,
                codeReference: undefined,
                followUp: messageData.followUps,
            }
            this.onChatAnswerReceived(messageData.tabID, answer)

            return
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

    // This handles messages received from the extension, to be published in the webview
    handleMessageReceive = async (messageData: any): Promise<void> => {
        console.log(`GumbyChatConnector handling message ${messageData.type}`)
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
            this.onAsyncEventProgress(messageData.tabID, messageData.inProgress, messageData.message ?? '')
            return
        }

        if (messageData.type === 'sendCommandMessage') {
            console.log('GumbyChatConnector sendCommandMessage')
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
            console.log('onCustomFormAction: action is undefined...')
            return
        }

        console.log(`onCustomFormAction: action.id ${action.id}, action.text ${action.text}`)
        switch (action.id) {
            case 'gumbyJavaHomeFormCancel':
                console.log('cancelled java home')
                break
            default:
                console.log('gumbyChatConnector: onCustomFormAction')

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
