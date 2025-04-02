/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemType, FeedbackPayload } from '@aws/mynah-ui'
import { TabType } from '../storages/tabsStorage'
import { getActions } from '../diffTree/actions'
import { DiffTreeFileInfo } from '../diffTree/types'
import { BaseConnector, BaseConnectorProps } from './baseConnector'

export interface ConnectorProps extends BaseConnectorProps {
    onAsyncEventProgress: (
        tabID: string,
        inProgress: boolean,
        message: string,
        messageId: string | undefined,
        enableStopAction: boolean
    ) => void
    onChatAnswerUpdated?: (tabID: string, message: ChatItem) => void
    sendFeedback?: (tabId: string, feedbackPayload: FeedbackPayload) => void | undefined
    onFileComponentUpdate: (
        tabID: string,
        filePaths: DiffTreeFileInfo[],
        deletedFiles: DiffTreeFileInfo[],
        messageId: string,
        disableFileActions: boolean
    ) => void
    onFileActionClick: (tabID: string, messageId: string, filePath: string, actionName: string) => void
    onUpdatePlaceholder: (tabID: string, newPlaceholder: string) => void
    onChatInputEnabled: (tabID: string, enabled: boolean) => void
    onUpdateAuthentication: (featureDevEnabled: boolean, authenticatingTabIDs: string[]) => void
}

export class Connector extends BaseConnector {
    private readonly onFileComponentUpdate
    private readonly onChatAnswerUpdated
    private readonly onAsyncEventProgress
    private readonly updatePlaceholder
    private readonly chatInputEnabled
    private readonly onUpdateAuthentication

    override getTabType(): TabType {
        return 'featuredev'
    }

    constructor(props: ConnectorProps) {
        super(props)
        this.onFileComponentUpdate = props.onFileComponentUpdate
        this.onAsyncEventProgress = props.onAsyncEventProgress
        this.updatePlaceholder = props.onUpdatePlaceholder
        this.chatInputEnabled = props.onChatInputEnabled
        this.onUpdateAuthentication = props.onUpdateAuthentication
        this.onChatAnswerUpdated = props.onChatAnswerUpdated
    }

    onOpenDiff = (tabID: string, filePath: string, deleted: boolean, messageId?: string): void => {
        this.sendMessageToExtension({
            command: 'open-diff',
            tabID,
            filePath,
            deleted,
            messageId,
            tabType: this.getTabType(),
        })
    }
    onFileActionClick = (tabID: string, messageId: string, filePath: string, actionName: string): void => {
        this.sendMessageToExtension({
            command: 'file-click',
            tabID,
            messageId,
            filePath,
            actionName,
            tabType: this.getTabType(),
        })
    }

    private createAnswer = (messageData: any): ChatItem => {
        return {
            type: messageData.messageType,
            body: messageData.message ?? undefined,
            messageId: messageData.messageId ?? messageData.messageID ?? messageData.triggerID ?? '',
            relatedContent: undefined,
            canBeVoted: messageData.canBeVoted ?? undefined,
            snapToTop: messageData.snapToTop ?? undefined,
            followUp:
                messageData.followUps !== undefined && Array.isArray(messageData.followUps)
                    ? {
                          text:
                              messageData.messageType === ChatItemType.SYSTEM_PROMPT ||
                              messageData.followUps.length === 0
                                  ? ''
                                  : 'Please follow up with one of these',
                          options: messageData.followUps,
                      }
                    : undefined,
        }
    }

    private processChatMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived !== undefined) {
            const answer = this.createAnswer(messageData)
            this.onChatAnswerReceived(messageData.tabID, answer, messageData)
        }
    }

    private processCodeResultMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived !== undefined) {
            const messageId =
                messageData.codeGenerationId ??
                messageData.messageId ??
                messageData.messageID ??
                messageData.triggerID ??
                messageData.conversationID
            this.sendMessageToExtension({
                tabID: messageData.tabID,
                command: 'store-code-result-message-id',
                messageId,
                tabType: 'featuredev',
            })
            const actions = getActions([...messageData.filePaths, ...messageData.deletedFiles])
            const answer: ChatItem = {
                type: ChatItemType.ANSWER,
                relatedContent: undefined,
                followUp: undefined,
                canBeVoted: true,
                codeReference: messageData.references,
                messageId,
                fileList: {
                    rootFolderTitle: 'Changes',
                    filePaths: messageData.filePaths.map((f: DiffTreeFileInfo) => f.zipFilePath),
                    deletedFiles: messageData.deletedFiles.map((f: DiffTreeFileInfo) => f.zipFilePath),
                    actions,
                },
                body: '',
            }
            this.onChatAnswerReceived(messageData.tabID, answer, messageData)
        }
    }

    handleMessageReceive = async (messageData: any): Promise<void> => {
        if (messageData.type === 'updateFileComponent') {
            this.onFileComponentUpdate(
                messageData.tabID,
                messageData.filePaths,
                messageData.deletedFiles,
                messageData.messageId,
                messageData.disableFileActions
            )
            return
        }
        if (messageData.type === 'updateChatAnswer') {
            const answer = this.createAnswer(messageData)
            this.onChatAnswerUpdated?.(messageData.tabID, answer)
            return
        }

        if (messageData.type === 'chatMessage') {
            await this.processChatMessage(messageData)
            return
        }

        if (messageData.type === 'codeResultMessage') {
            await this.processCodeResultMessage(messageData)
            return
        }

        if (messageData.type === 'asyncEventProgressMessage') {
            const enableStopAction = true
            this.onAsyncEventProgress(
                messageData.tabID,
                messageData.inProgress,
                messageData.message ?? undefined,
                messageData.messageId ?? undefined,
                enableStopAction
            )
            return
        }

        if (messageData.type === 'updatePlaceholderMessage') {
            this.updatePlaceholder(messageData.tabID, messageData.newPlaceholder)
            return
        }

        if (messageData.type === 'chatInputEnabledMessage') {
            this.chatInputEnabled(messageData.tabID, messageData.enabled)
            return
        }

        if (messageData.type === 'authenticationUpdateMessage') {
            this.onUpdateAuthentication(messageData.featureEnabled, messageData.authenticatingTabIDs)
            return
        }

        if (messageData.type === 'openNewTabMessage') {
            this.onNewTab('featuredev')
            return
        }

        // For other message types, call the base class handleMessageReceive
        await this.baseHandleMessageReceive(messageData)
    }

    sendFeedback = (tabId: string, feedbackPayload: FeedbackPayload): void | undefined => {
        this.sendMessageToExtension({
            command: 'chat-item-feedback',
            ...feedbackPayload,
            tabType: this.getTabType(),
            tabID: tabId,
        })
    }
}
