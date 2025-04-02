/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemType, FeedbackPayload, MynahIcons, ProgressField } from '@aws/mynah-ui'
import { TabType } from '../storages/tabsStorage'
import { DiffTreeFileInfo } from '../diffTree/types'
import { BaseConnectorProps, BaseConnector } from './baseConnector'

export interface ConnectorProps extends BaseConnectorProps {
    onAsyncEventProgress: (tabID: string, inProgress: boolean, message: string) => void
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
    onUpdatePromptProgress: (tabID: string, progressField: ProgressField) => void
    onChatInputEnabled: (tabID: string, enabled: boolean) => void
    onUpdateAuthentication: (featureDevEnabled: boolean, authenticatingTabIDs: string[]) => void
}

export class Connector extends BaseConnector {
    private readonly onFileComponentUpdate
    private readonly onAsyncEventProgress
    private readonly updatePlaceholder
    private readonly chatInputEnabled
    private readonly onUpdateAuthentication
    private readonly updatePromptProgress

    override getTabType(): TabType {
        return 'doc'
    }

    constructor(props: ConnectorProps) {
        super(props)
        this.onFileComponentUpdate = props.onFileComponentUpdate
        this.onAsyncEventProgress = props.onAsyncEventProgress
        this.updatePlaceholder = props.onUpdatePlaceholder
        this.chatInputEnabled = props.onChatInputEnabled
        this.onUpdateAuthentication = props.onUpdateAuthentication
        this.updatePromptProgress = props.onUpdatePromptProgress
    }

    onOpenDiff = (tabID: string, filePath: string, deleted: boolean): void => {
        this.sendMessageToExtension({
            command: 'open-diff',
            tabID,
            filePath,
            deleted,
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

    private processFolderConfirmationMessage = async (messageData: any, folderPath: string): Promise<void> => {
        if (this.onChatAnswerReceived !== undefined) {
            const answer: ChatItem = {
                type: ChatItemType.ANSWER,
                body: messageData.message ?? undefined,
                messageId: messageData.messageID ?? messageData.triggerID ?? '',
                fileList: {
                    rootFolderTitle: undefined,
                    fileTreeTitle: '',
                    filePaths: [folderPath],
                    details: {
                        [folderPath]: {
                            icon: MynahIcons.FOLDER,
                            clickable: false,
                        },
                    },
                },
                followUp: {
                    text: '',
                    options: messageData.followUps,
                },
            }
            this.onChatAnswerReceived(messageData.tabID, answer, messageData)
        }
    }

    private processChatMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived !== undefined) {
            const answer: ChatItem = {
                type: messageData.messageType,
                body: messageData.message ?? undefined,
                messageId: messageData.messageID ?? messageData.triggerID ?? '',
                relatedContent: undefined,
                canBeVoted: messageData.canBeVoted,
                snapToTop: messageData.snapToTop,
                followUp:
                    messageData.followUps !== undefined && messageData.followUps.length > 0
                        ? {
                              text:
                                  messageData.messageType === ChatItemType.SYSTEM_PROMPT
                                      ? ''
                                      : 'Select one of the following...',
                              options: messageData.followUps,
                          }
                        : undefined,
            }
            this.onChatAnswerReceived(messageData.tabID, answer, messageData)
        }
    }

    private processCodeResultMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived !== undefined) {
            const answer: ChatItem = {
                type: ChatItemType.ANSWER,
                relatedContent: undefined,
                followUp: undefined,
                canBeVoted: false,
                codeReference: messageData.references,
                // TODO get the backend to store a message id in addition to conversationID
                messageId:
                    messageData.codeGenerationId ??
                    messageData.messageID ??
                    messageData.triggerID ??
                    messageData.conversationID,
                fileList: {
                    rootFolderTitle: 'Documentation',
                    fileTreeTitle: 'Documents ready',
                    filePaths: messageData.filePaths.map((f: DiffTreeFileInfo) => f.zipFilePath),
                    deletedFiles: messageData.deletedFiles.map((f: DiffTreeFileInfo) => f.zipFilePath),
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

        if (messageData.type === 'chatMessage') {
            await this.processChatMessage(messageData)
            return
        }

        if (messageData.type === 'folderConfirmationMessage') {
            await this.processFolderConfirmationMessage(messageData, messageData.folderPath)
            return
        }

        if (messageData.type === 'codeResultMessage') {
            await this.processCodeResultMessage(messageData)
            return
        }

        if (messageData.type === 'asyncEventProgressMessage') {
            this.onAsyncEventProgress(messageData.tabID, messageData.inProgress, messageData.message ?? undefined)
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
            this.onNewTab(this.getTabType())
            return
        }

        if (messageData.type === 'updatePromptProgress') {
            this.updatePromptProgress(messageData.tabID, messageData.progressField)
            return
        }

        // For other message types, call the base class handleMessageReceive
        await this.baseHandleMessageReceive(messageData)
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
            tabType: 'doc',
            tabID: tabId,
        })
    }
}
