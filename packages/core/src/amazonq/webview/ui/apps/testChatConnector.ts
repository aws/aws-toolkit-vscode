/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class is responsible for listening to and processing events
 * from the webview and translating them into events to be handled by the extension,
 * and events from the extension and translating them into events to be handled by the webview.
 */

import { ChatItem, ChatItemType, MynahIcons, ProgressField } from '@aws/mynah-ui'
import { ExtensionMessage } from '../commands'
import { TabsStorage, TabType } from '../storages/tabsStorage'
import { TestMessageType } from '../../../../amazonqTest/chat/views/connector/connector'
import { ChatPayload } from '../connector'
import { BaseConnector, BaseConnectorProps } from './baseConnector'

export interface ConnectorProps extends BaseConnectorProps {
    sendMessageToExtension: (message: ExtensionMessage) => void
    onChatAnswerReceived?: (tabID: string, message: ChatItem, messageData: any) => void
    onRunTestMessageReceived?: (tabID: string, showRunTestMessage: boolean) => void
    onChatAnswerUpdated?: (tabID: string, message: ChatItem) => void
    onQuickHandlerCommand: (tabID: string, command: string, eventId?: string) => void
    onWarning: (tabID: string, message: string, title: string) => void
    onError: (tabID: string, message: string, title: string) => void
    onUpdateAuthentication: (testEnabled: boolean, authenticatingTabIDs: string[]) => void
    onChatInputEnabled: (tabID: string, enabled: boolean) => void
    onUpdatePlaceholder: (tabID: string, newPlaceholder: string) => void
    onUpdatePromptProgress: (tabID: string, progressField: ProgressField) => void
    tabsStorage: TabsStorage
}

export interface MessageData {
    tabID: string
    type: TestMessageType
}
// TODO: Refactor testChatConnector, scanChatConnector and other apps connector files post RIV
export class Connector extends BaseConnector {
    override getTabType(): TabType {
        return 'testgen'
    }
    readonly onAuthenticationUpdate
    override readonly sendMessageToExtension
    override readonly onChatAnswerReceived
    private readonly onChatAnswerUpdated
    private readonly chatInputEnabled
    private readonly updatePlaceholder
    private readonly updatePromptProgress
    override readonly onError
    private readonly tabStorage
    private readonly runTestMessageReceived

    constructor(props: ConnectorProps) {
        super(props)
        this.runTestMessageReceived = props.onRunTestMessageReceived
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onChatAnswerReceived = props.onChatAnswerReceived
        this.onChatAnswerUpdated = props.onChatAnswerUpdated
        this.chatInputEnabled = props.onChatInputEnabled
        this.updatePlaceholder = props.onUpdatePlaceholder
        this.updatePromptProgress = props.onUpdatePromptProgress
        this.onAuthenticationUpdate = props.onUpdateAuthentication
        this.onError = props.onError
        this.tabStorage = props.tabsStorage
    }

    startTestGen(tabID: string, prompt: string) {
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'start-test-gen',
            tabType: 'testgen',
            prompt,
        })
    }

    requestAnswer = (tabID: string, payload: ChatPayload) => {
        this.tabStorage.updateTabStatus(tabID, 'busy')
        this.sendMessageToExtension({
            tabID: tabID,
            command: 'chat-prompt',
            chatMessage: payload.chatMessage,
            chatCommand: payload.chatCommand,
            tabType: 'testgen',
        })
    }

    onCustomFormAction(
        tabId: string,
        action: {
            id: string
            text?: string | undefined
            description?: string | undefined
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
            tabType: 'testgen',
            tabID: tabId,
            description: action.description,
        })
    }

    onFileDiff = (tabID: string, filePath: string, deleted: boolean, messageId?: string): void => {
        // TODO: add this back once we can advance flow from here
        // this.sendMessageToExtension({
        //     command: 'open-diff',
        //     tabID,
        //     filePath,
        //     deleted,
        //     messageId,
        //     tabType: 'testgen',
        // })
    }

    private processChatMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerReceived === undefined) {
            return
        }
        if (messageData.command === 'test' && this.runTestMessageReceived) {
            this.runTestMessageReceived(messageData.tabID, true)
            return
        }
        if (messageData.message !== undefined) {
            const answer: ChatItem = {
                type: messageData.messageType,
                messageId: messageData.messageId ?? messageData.triggerID,
                body: messageData.message,
                canBeVoted: false,
                informationCard: messageData.informationCard,
            }
            this.onChatAnswerReceived(messageData.tabID, answer, messageData)
        }
    }
    // Displays the test generation summary message in the /test Tab before generating unit tests
    private processChatSummaryMessage = async (messageData: any): Promise<void> => {
        if (this.onChatAnswerUpdated === undefined) {
            return
        }
        if (messageData.message !== undefined) {
            const answer: ChatItem = {
                type: messageData.messageType,
                messageId: messageData.messageId ?? messageData.triggerID,
                body: messageData.message,
                canBeVoted: true,
                footer: messageData.filePath
                    ? {
                          fileList: {
                              rootFolderTitle: undefined,
                              fileTreeTitle: '',
                              filePaths: [messageData.filePath],
                              details: {
                                  [messageData.filePath]: {
                                      icon: MynahIcons.FILE,
                                      description: `Generating tests in ${messageData.filePath}`,
                                  },
                              },
                          },
                      }
                    : {},
            }
            this.onChatAnswerUpdated(messageData.tabID, answer)
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

    private processBuildProgressMessage = async (
        messageData: { type: TestMessageType } & Record<string, any>
    ): Promise<void> => {
        if (this.onChatAnswerReceived === undefined) {
            return
        }
        const answer: ChatItem = {
            type: messageData.messageType,
            canBeVoted: messageData.canBeVoted,
            messageId: messageData.messageId,
            followUp: messageData.followUps,
            fileList: messageData.fileList,
            body: messageData.message,
            codeReference: messageData.codeReference,
        }
        this.onChatAnswerReceived(messageData.tabID, answer, messageData)
    }

    // This handles messages received from the extension, to be forwarded to the webview
    handleMessageReceive = async (messageData: { type: TestMessageType } & Record<string, any>) => {
        switch (messageData.type) {
            case 'authNeededException':
                await this.processAuthNeededException(messageData)
                break
            case 'authenticationUpdateMessage':
                this.onAuthenticationUpdate(messageData.testEnabled, messageData.authenticatingTabIDs)
                break
            case 'chatInputEnabledMessage':
                this.chatInputEnabled(messageData.tabID, messageData.enabled)
                break
            case 'chatMessage':
                await this.processChatMessage(messageData)
                break
            case 'chatSummaryMessage':
                await this.processChatSummaryMessage(messageData)
                break
            case 'updatePlaceholderMessage':
                this.updatePlaceholder(messageData.tabID, messageData.newPlaceholder)
                break
            case 'buildProgressMessage':
                await this.processBuildProgressMessage(messageData)
                break
            case 'updatePromptProgress':
                this.updatePromptProgress(messageData.tabID, messageData.progressField)
                break
            case 'errorMessage':
                this.onError(messageData.tabID, messageData.message, messageData.title)
        }
    }
}
