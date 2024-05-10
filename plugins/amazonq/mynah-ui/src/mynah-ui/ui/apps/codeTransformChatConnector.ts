/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemAction, ChatItemType, NotificationType } from '@aws/mynah-ui-chat'
import { ExtensionMessage } from '../commands'
import { TabsStorage } from '../storages/tabsStorage'
import { FollowUpGenerator } from '../followUps/generator'
import { FormButtonIds } from '../forms/constants'

export interface ICodeTransformChatConnectorProps {
    sendMessageToExtension: (message: ExtensionMessage) => void
    onCodeTransformChatDisabled: (tabID: string) => void
    onCodeTransformMessageReceived: (tabID: string, message: ChatItem, isLoading: boolean, clearPreviousItemButtons?: boolean) => void
    onCodeTransformMessageUpdate: (tabID: string, messageId: string, chatItem: Partial<ChatItem>) => void
    onCodeTransformCommandMessageReceived: (message: ChatItem, command?: string) => void
    onNotification: (props: {content: string; title?: string; type: NotificationType}) => void
    onStartNewTransform: (tabID: string) => void
    onUpdateAuthentication: (featureDevEnabled: boolean, codeTransformEnabled: boolean, authenticatingTabIDs: string[]) => void
    tabsStorage: TabsStorage
}

export class CodeTransformChatConnector {
    private readonly sendMessageToExtension
    private readonly onCodeTransformChatDisabled
    private readonly onCodeTransformMessageReceived
    private readonly onCodeTransformMessageUpdated
    private readonly onCodeTransformCommandMessageReceived
    private readonly onNotification
    private readonly onStartNewTransform
    private readonly onUpdateAuthentication
    private readonly tabsStorage
    private readonly followUpGenerator: FollowUpGenerator

    constructor(props: ICodeTransformChatConnectorProps) {
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onStartNewTransform = props.onStartNewTransform
        this.onCodeTransformChatDisabled = props.onCodeTransformChatDisabled
        this.onCodeTransformMessageReceived = props.onCodeTransformMessageReceived
        this.onCodeTransformMessageUpdated = props.onCodeTransformMessageUpdate
        this.onCodeTransformCommandMessageReceived = props.onCodeTransformCommandMessageReceived
        this.onNotification = props.onNotification
        this.onUpdateAuthentication = props.onUpdateAuthentication
        this.tabsStorage = props.tabsStorage
        this.followUpGenerator = new FollowUpGenerator()
    }

    followUpClicked = (tabID: string, followUp: ChatItemAction): void => {
        if (followUp.prompt === 'Start a new transformation') {
            this.onStartNewTransform(tabID)
            this.sendMessageToExtension({
                command: 'codetransform-new',
                tabID,
                tabType: 'codetransform',
            })
        }
    }

    private processCodeTransformNotificationMessage = (messageData: any): void => {
        // Check for existing opened transform tab
        const codeTransformTab = this.tabsStorage.getTabs().find((tab) => tab.type === 'codetransform')
        if (codeTransformTab === undefined || !codeTransformTab.isSelected) {
            this.onNotification({ content: messageData.content, title: messageData.title, type: NotificationType.INFO })
        }
    }

    private processCodeTransformCommandMessage = (messageData: any): void => {
        this.onCodeTransformCommandMessageReceived(messageData, messageData.command)
    }

    private processChatMessage = (messageData: any): void => {
        if (this.onCodeTransformMessageReceived === undefined) {
            return
        }

        const tabID = messageData.tabID
        const isAddingNewItem: boolean = messageData.isAddingNewItem
        const isLoading: boolean = messageData.isLoading
        const clearPreviousItemButtons: boolean = messageData.clearPreviousItemButtons
        const type = messageData.messageType

        if (isAddingNewItem && type === ChatItemType.ANSWER_PART) {
            this.onCodeTransformMessageReceived(tabID, {
                type: ChatItemType.ANSWER_STREAM,
            }, isLoading)
        }

        const chatItem: ChatItem = {
            type: type,
            body: messageData.message ?? undefined,
            messageId: messageData.messageId ?? messageData.triggerID ?? '',
            relatedContent: undefined,
            canBeVoted: messageData.canBeVoted,
            formItems: messageData.formItems,
            buttons:
                messageData.buttons !== undefined && messageData.buttons.length > 0 ? messageData.buttons : undefined,
            followUp:
                messageData.followUps !== undefined && messageData.followUps.length > 0
                    ? {
                          text: '',
                          options: messageData.followUps,
                      }
                    : undefined,
        }
        this.onCodeTransformMessageReceived(tabID, chatItem, isLoading, clearPreviousItemButtons)
    }

    private processChatUpdateMessage = (messageData: any): void => {
        if (this.onCodeTransformMessageUpdated === undefined) {
            return
        }

        const tabID = messageData.tabID
        const targetMessageId = messageData.targetMessageId

        const updatedItem: Partial<ChatItem> = {
            body: messageData.message ?? undefined,
            relatedContent: undefined,
            canBeVoted: messageData.canBeVoted,
            formItems: messageData.formItems,
            buttons:
                messageData.buttons !== undefined && messageData.buttons.length > 0 ? messageData.buttons : undefined,
            followUp:
                messageData.followUps !== undefined && messageData.followUps.length > 0
                    ? {
                          text: '',
                          options: messageData.followUps,
                      }
                    : undefined,
        }
        this.onCodeTransformMessageUpdated(tabID, targetMessageId, updatedItem)
    }

    private processAuthNeededException = async (messageData: any): Promise<void> => {
        if (this.onCodeTransformMessageReceived === undefined) {
            return
        }

        this.onCodeTransformChatDisabled(messageData.tabID)

        this.onCodeTransformMessageReceived(messageData.tabID, {
            type: ChatItemType.ANSWER,
            body: messageData.message,
            followUp: this.followUpGenerator.generateAuthFollowUps('codetransform', messageData.authType),
            canBeVoted: false,
        }, false)

        return
    }

    handleMessageReceive = async (messageData: any): Promise<void> => {
        if (messageData.type === 'chatMessage') {
            this.processChatMessage(messageData)
            return
        }

        if (messageData.type === 'codeTransformCommandMessage') {
            this.processCodeTransformCommandMessage(messageData)
            return
        }

        if (messageData.type === 'codeTransformNotificationMessage') {
            this.processCodeTransformNotificationMessage(messageData)
            return
        }

        if (messageData.type === 'authNeededException') {
            await this.processAuthNeededException(messageData)
            return
        }

        if (messageData.type === 'authenticationUpdateMessage') {
            this.onUpdateAuthentication(messageData.featureDevEnabled, messageData.codeTransformEnabled, messageData.authenticatingTabIDs)
            return
        }

        if (messageData.type === 'codeTransformChatUpdateMessage') {
            this.processChatUpdateMessage(messageData)
            return
        }
    }

    onFormButtonClick = (
        tabID: string,
        action: {
            id: string
            text?: string
            formItemValues?: Record<string, string>
        }
    ) => {
        if (action.id === FormButtonIds.CodeTransformInputConfirm) {
            this.sendMessageToExtension({
                command: 'codetransform-start',
                tabID,
                tabType: 'codetransform',
                modulePath: action.formItemValues?.module,
                targetVersion: 'Java 17',
            })
        } else if (action.id === FormButtonIds.CodeTransformInputCancel) {
            this.sendMessageToExtension({
                command: 'codetransform-cancel',
                tabID,
                tabType: 'codetransform',
            })
        } else if (action.id === FormButtonIds.OpenMvnBuild) {
            console.log('open_mvn_build')

            this.sendMessageToExtension({
                command: 'codetransform-open-mvn-build',
                tabID,
                tabType: 'codetransform',
            })
        } else if (action.id === FormButtonIds.StopTransform) {
            this.sendMessageToExtension({
                command: 'codetransform-stop',
                tabID,
                tabType: 'codetransform',
            })
        } else if (action.id === FormButtonIds.OpenTransformationHub) {
            this.sendMessageToExtension({
                command: 'codetransform-open-transform-hub',
                tabID,
                tabType: 'codetransform',
            })
        } else if (action.id === FormButtonIds.CodeTransformViewDiff) {
            this.sendMessageToExtension({
                command: 'codetransform-view-diff',
                tabID,
                tabType: 'codetransform',
            })
        } else if (action.id === FormButtonIds.CodeTransformViewSummary) {
            this.sendMessageToExtension({
                command: 'codetransform-view-summary',
                tabID,
                tabType: 'codetransform',
            })
        } else if (action.id === FormButtonIds.ConfirmHilSelection) {
            this.sendMessageToExtension({
                command: 'codetransform-confirm-hil-selection',
                tabID,
                tabType: 'codetransform',
                version: action.formItemValues?.dependencyVersion,
            })
        } else if (action.id === FormButtonIds.RejectHilSelection) {
            this.sendMessageToExtension({
                command: 'codetransform-reject-hil-selection',
                tabID,
                tabType: 'codetransform',
            })
        } else if (action.id === FormButtonIds.OpenDependencyErrorPom) {
            this.sendMessageToExtension({
                command: 'codetransform-pom-file-open-click',
                tabID,
                tabType: 'codetransform',
            })
        }
    }

    onTabOpen = (tabID: string) => {
        this.sendMessageToExtension({
            tabID,
            command: 'new-tab-was-created',
            tabType: 'codetransform',
        })
    }

    onTabRemove = (tabID: string) => {
        this.sendMessageToExtension({
            tabID,
            command: 'tab-was-removed',
            tabType: 'codetransform',
        })
    }

    transform = (tabID: string): void => {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'transform',
            chatMessage: 'transform',
            tabType: 'codetransform',
        })
    }

    onResponseBodyLinkClick = (tabID: string, messageId: string, link: string): void => {
        this.sendMessageToExtension({
            command: 'response-body-link-click',
            tabID,
            messageId,
            link,
            tabType: 'codetransform',
        })
    }
}
