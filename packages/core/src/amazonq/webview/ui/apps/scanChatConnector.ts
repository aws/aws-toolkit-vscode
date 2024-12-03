/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class is responsible for listening to and processing events
 * from the webview and translating them into events to be handled by the extension,
 * and events from the extension and translating them into events to be handled by the webview.
 */

import { ChatItem, ChatItemType, ProgressField } from '@aws/mynah-ui'
import { ExtensionMessage } from '../commands'
import { TabsStorage, TabType } from '../storages/tabsStorage'
import { ScanMessageType } from '../../../../amazonqScan/connector'
import { BaseConnector, BaseConnectorProps } from './baseConnector'

export interface ConnectorProps extends BaseConnectorProps {
    sendMessageToExtension: (message: ExtensionMessage) => void
    onChatAnswerReceived?: (tabID: string, message: ChatItem, messageData: any) => void
    onQuickHandlerCommand: (tabID: string, command: string, eventId?: string) => void
    onWarning: (tabID: string, message: string, title: string) => void
    onError: (tabID: string, message: string, title: string) => void
    onUpdateAuthentication: (scanEnabled: boolean, authenticatingTabIDs: string[]) => void
    onChatInputEnabled: (tabID: string, enabled: boolean) => void
    onUpdatePlaceholder: (tabID: string, newPlaceholder: string) => void
    onUpdatePromptProgress: (tabID: string, progressField: ProgressField) => void
    tabsStorage: TabsStorage
}

export interface MessageData {
    tabID: string
    type: ScanMessageType
}

export class Connector extends BaseConnector {
    override getTabType(): TabType {
        return 'review'
    }
    readonly onAuthenticationUpdate
    override readonly sendMessageToExtension
    override readonly onError
    override readonly onChatAnswerReceived
    private readonly chatInputEnabled
    private readonly onQuickHandlerCommand
    private readonly updatePlaceholder
    private readonly updatePromptProgress

    constructor(props: ConnectorProps) {
        super(props)
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onChatAnswerReceived = props.onChatAnswerReceived
        this.onError = props.onError
        this.chatInputEnabled = props.onChatInputEnabled
        this.updatePlaceholder = props.onUpdatePlaceholder
        this.updatePromptProgress = props.onUpdatePromptProgress
        this.onQuickHandlerCommand = props.onQuickHandlerCommand
        this.onAuthenticationUpdate = props.onUpdateAuthentication
    }

    scan = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'review',
            chatMessage: '',
            tabType: 'review',
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
            tabType: 'review',
            tabID: tabId,
        })
    }

    private processChatPrompt = async (messageData: any, tabID: string): Promise<void> => {
        if (this.onChatAnswerReceived === undefined) {
            return
        }
        const answer: ChatItem = {
            type: ChatItemType.PROMPT,
            body: messageData.message,
            followUp: undefined,
            status: 'info',
            canBeVoted: false,
        }
        this.onChatAnswerReceived(tabID, answer, messageData)
        return
    }

    private processExecuteCommand = async (messageData: any): Promise<void> => {
        this.onQuickHandlerCommand(messageData.tabID, messageData.command, messageData.eventId)
    }

    private processChatMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived === undefined) {
            return
        }

        if (messageData.message !== undefined) {
            const answer: ChatItem = {
                type: messageData.messageType,
                messageId: messageData.messageId ?? messageData.triggerID,
                body: messageData.message,
                buttons: messageData.buttons ?? [],
                canBeVoted: messageData.canBeVoted,
                followUp:
                    messageData.followUps !== undefined && messageData.followUps.length > 0
                        ? {
                              text: '',
                              options: messageData.followUps,
                          }
                        : undefined,
                informationCard: messageData.informationCard,
                fileList: messageData.fileList,
            }

            this.onChatAnswerReceived(messageData.tabID, answer, messageData)
        }
    }

    override processAuthNeededException = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived === undefined) {
            return
        }

        this.onChatAnswerReceived(
            messageData.tabID,
            {
                type: ChatItemType.SYSTEM_PROMPT,
                body: messageData.message,
            },
            messageData
        )
    }

    // This handles messages received from the extension, to be forwarded to the webview
    handleMessageReceive = async (messageData: { type: ScanMessageType } & Record<string, any>) => {
        switch (messageData.type) {
            case 'authNeededException':
                await this.processAuthNeededException(messageData)
                break
            case 'authenticationUpdateMessage':
                this.onAuthenticationUpdate(messageData.scanEnabled, messageData.authenticatingTabIDs)
                break
            case 'chatInputEnabledMessage':
                this.chatInputEnabled(messageData.tabID, messageData.enabled)
                break
            case 'chatMessage':
                await this.processChatMessage(messageData)
                break
            case 'updatePlaceholderMessage':
                this.updatePlaceholder(messageData.tabID, messageData.newPlaceholder)
                break
            case 'updatePromptProgress':
                this.updatePromptProgress(messageData.tabID, messageData.progressField)
                break
            case 'chatPrompt':
                await this.processChatPrompt(messageData, messageData.tabID)
                break
            case 'errorMessage':
                this.onError(messageData.tabID, messageData.message, messageData.title)
                break
            case 'sendCommandMessage':
                await this.processExecuteCommand(messageData)
                break
        }
    }

    onFileClick = (tabID: string, filePath: string, messageId?: string) => {
        this.sendMessageToExtension({
            command: 'file-click',
            tabID,
            messageId,
            filePath,
            tabType: 'review',
        })
    }
}
