/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemButton, ChatItemFormItem, ChatItemType, MynahUIDataModel, QuickActionCommand } from '@aws/mynah-ui'
import { TabType } from '../storages/tabsStorage'
import { CWCChatItem } from '../connector'
import { BaseConnector, BaseConnectorProps } from './baseConnector'
import { createPromptCommand } from '../tabs/constants'

export interface ConnectorProps extends BaseConnectorProps {
    onCWCContextCommandMessage: (message: CWCChatItem, command?: string) => string | undefined
    onContextCommandDataReceived: (data: MynahUIDataModel['contextCommands']) => void
    onShowCustomForm: (
        tabId: string,
        formItems?: ChatItemFormItem[],
        buttons?: ChatItemButton[],
        title?: string,
        description?: string
    ) => void
}

export class Connector extends BaseConnector {
    private readonly onCWCContextCommandMessage
    private readonly onContextCommandDataReceived
    private readonly onShowCustomForm

    override getTabType(): TabType {
        return 'cwc'
    }

    constructor(props: ConnectorProps) {
        super(props)
        this.onCWCContextCommandMessage = props.onCWCContextCommandMessage
        this.onContextCommandDataReceived = props.onContextCommandDataReceived
        this.onShowCustomForm = props.onShowCustomForm
    }

    onSourceLinkClick = (tabID: string, messageId: string, link: string): void => {
        this.sendMessageToExtension({
            command: 'source-link-click',
            tabID,
            messageId,
            link,
            tabType: this.getTabType(),
        })
    }

    private processEditorContextCommandMessage = async (messageData: any): Promise<void> => {
        const triggerTabID = this.onCWCContextCommandMessage(
            {
                body: messageData.message,
                type: ChatItemType.PROMPT,
            },
            messageData.command
        )
        await this.sendTriggerTabIDReceived(
            messageData.triggerID,
            triggerTabID !== undefined ? triggerTabID : 'no-available-tabs'
        )
    }

    private sendTriggerTabIDReceived = async (triggerID: string, tabID: string): Promise<void> => {
        this.sendMessageToExtension({
            command: 'trigger-tabID-received',
            triggerID,
            tabID,
            tabType: this.getTabType(),
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
                          text: messageData.followUpsHeader ?? 'Suggested follow up questions:',
                          options: messageData.followUps,
                      }
                    : undefined

            const answer: CWCChatItem = {
                type: messageData.messageType,
                messageId: messageData.messageID ?? messageData.triggerID,
                body: messageData.message,
                followUp: followUps,
                canBeVoted: true,
                codeReference: messageData.codeReference,
                userIntent: messageData.userIntent,
                codeBlockLanguage: messageData.codeBlockLanguage,
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
            this.onChatAnswerReceived(messageData.tabID, answer, messageData)

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
            const answer: CWCChatItem = {
                type: messageData.messageType,
                body: undefined,
                relatedContent: undefined,
                messageId: messageData.messageID,
                codeReference: messageData.codeReference,
                userIntent: messageData.userIntent,
                codeBlockLanguage: messageData.codeBlockLanguage,
                followUp:
                    messageData.followUps !== undefined && messageData.followUps.length > 0
                        ? {
                              text: 'Suggested follow up questions:',
                              options: messageData.followUps,
                          }
                        : undefined,
            }
            this.onChatAnswerReceived(messageData.tabID, answer, messageData)

            return
        }
    }

    processContextCommandData(messageData: any) {
        if (messageData.data) {
            this.onContextCommandDataReceived(messageData.data)
        }
    }

    private showCustomFormMessage = (messageData: any) => {
        this.onShowCustomForm(
            messageData.tabID,
            messageData.formItems,
            messageData.buttons,
            messageData.title,
            messageData.description
        )
    }

    handleMessageReceive = async (messageData: any): Promise<void> => {
        if (messageData.type === 'chatMessage') {
            await this.processChatMessage(messageData)
            return
        }

        if (messageData.type === 'editorContextCommandMessage') {
            await this.processEditorContextCommandMessage(messageData)
            return
        }

        if (messageData.type === 'contextCommandData') {
            this.processContextCommandData(messageData)
            return
        }
        if (messageData.type === 'showCustomFormMessage') {
            this.showCustomFormMessage(messageData)
            return
        }

        if (messageData.type === 'customFormActionMessage') {
            this.onCustomFormAction(messageData.tabID, messageData.action)
            return
        }
        // For other message types, call the base class handleMessageReceive
        await this.baseHandleMessageReceive(messageData)
    }

    onQuickCommandGroupActionClick = (tabID: string, action: { id: string }) => {
        this.sendMessageToExtension({
            command: 'quick-command-group-action-click',
            actionId: action.id,
            tabID,
            tabType: this.getTabType(),
        })
    }

    onContextSelected = (tabID: string, contextItem: QuickActionCommand) => {
        this.sendMessageToExtension({
            command: 'context-selected',
            contextItem,
            tabID,
            tabType: this.getTabType(),
        })

        if (contextItem.command === createPromptCommand) {
            return false
        }
        return true
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
            action: action,
            tabType: this.getTabType(),
            tabID: tabId,
        })
    }
}
