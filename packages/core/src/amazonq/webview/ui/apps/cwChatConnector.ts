/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ChatItem,
    ChatItemButton,
    ChatItemFormItem,
    ChatItemType,
    MynahIconsType,
    MynahUIDataModel,
    QuickActionCommand,
} from '@aws/mynah-ui'
import { TabType } from '../storages/tabsStorage'
import { CWCChatItem } from '../connector'
import { BaseConnector, BaseConnectorProps } from './baseConnector'

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
    onChatAnswerUpdated?: (tabID: string, message: ChatItem) => void
    onAsyncEventProgress: (
        tabID: string,
        inProgress: boolean,
        message: string,
        messageId: string | undefined,
        enableStopAction: boolean,
        isPromptInputDisabled: boolean
    ) => void
}

export class Connector extends BaseConnector {
    private readonly onCWCContextCommandMessage
    private readonly onContextCommandDataReceived
    private readonly onShowCustomForm
    private readonly onChatAnswerUpdated
    private readonly onAsyncEventProgress
    private chatItems: Map<string, Map<string, ChatItem>> = new Map() // tabId -> messageId -> ChatItem

    override getTabType(): TabType {
        return 'cwc'
    }

    constructor(props: ConnectorProps) {
        super(props)
        this.onCWCContextCommandMessage = props.onCWCContextCommandMessage
        this.onContextCommandDataReceived = props.onContextCommandDataReceived
        this.onShowCustomForm = props.onShowCustomForm
        this.onChatAnswerUpdated = props.onChatAnswerUpdated
        this.onAsyncEventProgress = props.onAsyncEventProgress
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
                canBeVoted: messageData.canBeVoted ?? false,
                codeReference: messageData.codeReference,
                userIntent: messageData.userIntent,
                codeBlockLanguage: messageData.codeBlockLanguage,
                contextList: messageData.contextList,
                title: messageData.title,
                buttons: messageData.buttons ?? undefined,
                fileList: messageData.fileList ?? undefined,
                header: messageData.header ?? undefined,
                padding: messageData.padding ?? undefined,
                fullWidth: messageData.fullWidth ?? undefined,
                codeBlockActions: messageData.codeBlockActions ?? undefined,
                rootFolderTitle: messageData.rootFolderTitle ?? undefined,
            }

            if (messageData.relatedSuggestions !== undefined) {
                answer.relatedContent = {
                    title: 'Sources',
                    content: messageData.relatedSuggestions,
                }
            }

            if (answer.messageId) {
                this.storeChatItem(messageData.tabID, answer.messageId, answer)
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
                buttons: messageData.buttons ?? undefined,
                canBeVoted: messageData.canBeVoted ?? false,
                header: messageData.header ?? undefined,
                padding: messageData.padding ?? undefined,
                fullWidth: messageData.fullWidth ?? undefined,
                codeBlockActions: messageData.codeBlockActions ?? undefined,
            }
            this.onChatAnswerReceived(messageData.tabID, answer, messageData)

            return
        }
    }

    private processToolMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerUpdated === undefined) {
            return
        }
        const answer: CWCChatItem = {
            type: messageData.messageType,
            messageId: messageData.messageID ?? messageData.triggerID,
            body: messageData.message,
            followUp: messageData.followUps,
            canBeVoted: messageData.canBeVoted ?? false,
            codeReference: messageData.codeReference,
            userIntent: messageData.contextList,
            codeBlockLanguage: messageData.codeBlockLanguage,
            contextList: messageData.contextList,
            title: messageData.title,
            buttons: messageData.buttons,
            fileList: messageData.fileList,
            header: messageData.header ?? undefined,
            padding: messageData.padding ?? undefined,
            fullWidth: messageData.fullWidth ?? undefined,
            codeBlockActions: messageData.codeBlockActions ?? undefined,
            rootFolderTitle: messageData.rootFolderTitle,
        }
        this.onChatAnswerUpdated(messageData.tabID, answer)
        return
    }

    private storeChatItem(tabId: string, messageId: string, item: ChatItem): void {
        if (!this.chatItems.has(tabId)) {
            this.chatItems.set(tabId, new Map())
        }
        this.chatItems.get(tabId)?.set(messageId, { ...item })
    }

    private getCurrentChatItem(tabId: string, messageId: string | undefined): ChatItem | undefined {
        if (!messageId) {
            return
        }
        return this.chatItems.get(tabId)?.get(messageId)
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

    onFormTextualItemKeyPress = (
        tabId: string,
        event: KeyboardEvent,
        formData: Record<string, string>,
        itemId: string,
        eventId?: string
    ) => {
        if (itemId === 'prompt-name' && event.key === 'Enter') {
            event.preventDefault()
            this.sendMessageToExtension({
                command: 'form-action-click',
                action: {
                    id: 'submit-create-prompt',
                    formItemValues: formData,
                },
                tabType: this.getTabType(),
                tabID: tabId,
            })
            return true
        }
        return false
    }

    handleMessageReceive = async (messageData: any): Promise<void> => {
        if (messageData.type === 'chatMessage') {
            await this.processChatMessage(messageData)
            return
        }

        if (messageData.type === 'toolMessage') {
            await this.processToolMessage(messageData)
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
            this.onCustomFormAction(messageData.tabID, messageData.messageId, messageData.action, messageData.triggerId)
            return
        }

        if (messageData.type === 'asyncEventProgressMessage') {
            const isPromptInputDisabled = true
            this.onAsyncEventProgress(
                messageData.tabID,
                messageData.inProgress,
                messageData.message ?? undefined,
                messageData.messageId ?? undefined,
                messageData.inProgress,
                isPromptInputDisabled
            )
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
        if (contextItem.id === 'create-saved-prompt') {
            return false
        }
        return true
    }

    onCustomFormAction(
        tabId: string,
        messageId: string | undefined,
        action: {
            id: string
            text?: string | undefined
            formItemValues?: Record<string, string> | undefined
        },
        triggerId: string
    ) {
        if (action === undefined) {
            return
        }

        if (messageId?.startsWith('tooluse_')) {
            action.formItemValues = { ...action.formItemValues, toolUseId: messageId }
        }

        this.sendMessageToExtension({
            command: 'form-action-click',
            action: action,
            formSelectedValues: action.formItemValues,
            tabType: this.getTabType(),
            tabID: tabId,
            triggerId: triggerId,
        })

        if (
            !this.onChatAnswerUpdated ||
            ![
                'accept-code-diff',
                'reject-code-diff',
                'run-shell-command',
                'reject-shell-command',
                'confirm-tool-use',
                'reject-tool-use',
            ].includes(action.id)
        ) {
            return
        }

        // Can not assign body as "undefined" or "null" because both of these values will be overriden at main.ts in onChatAnswerUpdated
        // TODO: Refactor in next PR if necessary.
        const currentChatItem = this.getCurrentChatItem(tabId, messageId)
        const answer: ChatItem = {
            type: ChatItemType.ANSWER,
            messageId: messageId,
            buttons: [],
            body: undefined,
            header: currentChatItem?.header ? { ...currentChatItem.header } : {},
        }
        switch (action.id) {
            case 'accept-code-diff':
                if (answer.header) {
                    answer.header.status = {
                        icon: 'ok' as MynahIconsType,
                        text: 'Accepted',
                        status: 'success',
                    }
                    answer.header.buttons = []
                    answer.body = ' '
                }
                break
            case 'reject-code-diff':
                if (answer.header) {
                    answer.header.status = {
                        icon: 'cancel' as MynahIconsType,
                        text: 'Change discarded',
                        status: 'error',
                    }
                    answer.header.buttons = []
                    answer.body = ' '
                }
                break
            case 'run-shell-command':
                if (answer.header) {
                    answer.header.status = {
                        icon: 'ok' as MynahIconsType,
                        text: 'Accepted',
                        status: 'success',
                    }
                    answer.header.buttons = []
                }
                break
            case 'reject-shell-command':
                if (answer.header) {
                    answer.header.status = {
                        icon: 'cancel' as MynahIconsType,
                        text: 'Rejected',
                        status: 'error',
                    }
                    answer.header.buttons = []
                }
                break
            case 'confirm-tool-use':
                if (answer.header) {
                    answer.header.status = {
                        icon: 'ok' as MynahIconsType,
                        text: 'Accepted',
                        status: 'success',
                    }
                    answer.header.buttons = []
                }
                break
            case 'reject-tool-use':
                if (answer.header) {
                    answer.header.status = {
                        icon: 'cancel' as MynahIconsType,
                        text: 'Rejected',
                        status: 'error',
                    }
                    answer.header.buttons = []
                }
                break
            default:
                break
        }

        if (currentChatItem && answer.messageId) {
            const updatedItem = { ...currentChatItem, ...answer }
            this.storeChatItem(tabId, answer.messageId, updatedItem)
        }

        this.onChatAnswerUpdated(tabId, answer)
    }

    onFileClick = (tabID: string, filePath: string, messageId?: string) => {
        this.sendMessageToExtension({
            command: 'file-click',
            tabID,
            messageId,
            filePath,
            tabType: 'cwc',
        })
    }
}
