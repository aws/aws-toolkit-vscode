/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EditorContextExtractor, TriggerType } from '../../editor/context/extractor'
import { ChatSessionStorage } from '../../storages/chatSession'
import { ChatRequest, EditorContext, IdeTriggerRequest } from '../../clients/chat/v0/model'
import { Messenger } from './messenger/messenger'
import {
    PromptMessage,
    ChatTriggerType,
    TriggerPayload,
    TabClosedMessage,
    InsertCodeAtCursorPostion,
    TriggerTabIDReceived,
} from './model'
import { AppToWebViewMessageDispatcher } from '../../view/connector/connector'
import { MessagePublisher } from '../../../awsq/messages/messagePublisher'
import { MessageListener } from '../../../awsq/messages/messageListener'
import { EditorContentController } from '../../editor/context/contentController'
import { EditorContextCommand } from '../../commands/registerCommands'
import { PromptsGenerator } from './prompts/promptsGenerator'
import { TriggerEventsStorage } from '../../storages/triggerEvents'
import { randomUUID } from 'crypto'

export interface ChatControllerMessagePublishers {
    readonly processPromptChatMessage: MessagePublisher<PromptMessage>
    readonly processTabClosedMessage: MessagePublisher<TabClosedMessage>
    readonly processInsertCodeAtCursorPosition: MessagePublisher<InsertCodeAtCursorPostion>
    readonly processContextMenuCommand: MessagePublisher<EditorContextCommand>
    readonly processTriggerTabIDReceived: MessagePublisher<TriggerTabIDReceived>
}

export interface ChatControllerMessageListeners {
    readonly processPromptChatMessage: MessageListener<PromptMessage>
    readonly processTabClosedMessage: MessageListener<TabClosedMessage>
    readonly processInsertCodeAtCursorPosition: MessageListener<InsertCodeAtCursorPostion>
    readonly processContextMenuCommand: MessageListener<EditorContextCommand>
    readonly processTriggerTabIDReceived: MessageListener<TriggerTabIDReceived>
}

export class ChatController {
    private readonly sessionStorage: ChatSessionStorage
    private readonly triggerEventsStorage: TriggerEventsStorage
    private readonly messenger: Messenger
    private readonly editorContextExtractor: EditorContextExtractor
    private readonly editorContentController: EditorContentController
    private readonly promptGenerator: PromptsGenerator

    public constructor(
        private readonly chatControllerMessageListeners: ChatControllerMessageListeners,
        appsToWebViewMessagePublisher: MessagePublisher<any>
    ) {
        this.sessionStorage = new ChatSessionStorage()
        this.triggerEventsStorage = new TriggerEventsStorage()
        this.messenger = new Messenger(new AppToWebViewMessageDispatcher(appsToWebViewMessagePublisher))
        this.editorContextExtractor = new EditorContextExtractor()
        this.editorContentController = new EditorContentController()
        this.promptGenerator = new PromptsGenerator()

        this.chatControllerMessageListeners.processPromptChatMessage.onMessage(data => {
            this.processPromptChatMessage(data)
        })

        this.chatControllerMessageListeners.processTabClosedMessage.onMessage(data => {
            this.processTabCloseMessage(data)
        })

        this.chatControllerMessageListeners.processInsertCodeAtCursorPosition.onMessage(data => {
            this.processInsertCodeAtCursorPosition(data)
        })

        this.chatControllerMessageListeners.processContextMenuCommand.onMessage(data => {
            this.processContextMenuCommand(data)
        })

        this.chatControllerMessageListeners.processTriggerTabIDReceived.onMessage(data => {
            this.processTriggerTabIDReceived(data)
        })
    }

    private async processTriggerTabIDReceived(message: TriggerTabIDReceived) {
        this.triggerEventsStorage.updateTriggerEventTabIDFromUnknown(message.triggerID, message.tabID)
    }

    private async processInsertCodeAtCursorPosition(message: InsertCodeAtCursorPostion) {
        this.editorContentController.insertTextAtCursorPosition(message.code)
    }

    private async processTabCloseMessage(message: TabClosedMessage) {
        this.sessionStorage.deleteSession(message.tabID)
        this.triggerEventsStorage.removeTabEvents(message.tabID)
    }

    private async processContextMenuCommand(command: EditorContextCommand) {
        try {
            this.editorContextExtractor.extractContextForTrigger(TriggerType.ContextMenu).then(context => {
                const triggerID = randomUUID()

                const prompt = this.promptGenerator.getPromptForContextMenuCommand(
                    command,
                    context?.codeSelectionContext?.selectedCode ?? ''
                )

                this.triggerEventsStorage.addTriggerEvent({
                    id: triggerID,
                    tabID: undefined,
                    message: prompt,
                    type: 'editor_context_command',
                    context,
                })

                this.messenger.sendEditorContextCommandMessage(prompt, triggerID)

                this.generateResponse(
                    {
                        message: this.promptGenerator.getPromptForContextMenuCommand(
                            command,
                            context?.codeSelectionContext?.selectedCode ?? ''
                        ),
                        trigger: ChatTriggerType.ChatMessage,
                        query: undefined,
                        code: context?.codeSelectionContext?.selectedCode,
                        fileText: context?.activeFileContext?.fileText,
                        fileLanguage: context?.activeFileContext?.fileLanguage,
                        matchPolicy: context?.activeFileContext?.matchPolicy,
                        codeQuery: context?.codeSelectionContext?.names,
                    },
                    triggerID
                )
            })
        } catch (e) {
            if (typeof e === 'string') {
                this.messenger.sendErrorMessage(e.toUpperCase(), 'tab-1')
            } else if (e instanceof Error) {
                this.messenger.sendErrorMessage(e.message, 'tab-1')
            }
        }
    }

    private async processPromptChatMessage(message: PromptMessage) {
        if (message.message == undefined) {
            this.messenger.sendErrorMessage('chatMessage should be set', message.tabID)
            return
        }

        try {
            await this.processPromptMessageAsNewThread(message)
        } catch (e) {
            if (typeof e === 'string') {
                this.messenger.sendErrorMessage(e.toUpperCase(), message.tabID)
            } else if (e instanceof Error) {
                this.messenger.sendErrorMessage(e.message, message.tabID)
            }
        }
    }

    private async processPromptMessageAsNewThread(message: PromptMessage) {
        try {
            this.editorContextExtractor.extractContextForTrigger(TriggerType.ChatMessage).then(context => {
                const triggerID = randomUUID()
                this.triggerEventsStorage.addTriggerEvent({
                    id: triggerID,
                    tabID: message.tabID,
                    message: message.message,
                    type: 'chat_message',
                    context,
                })
                this.generateResponse(
                    {
                        message: message.message,
                        trigger: ChatTriggerType.ChatMessage,
                        query: message.message,
                        code: undefined,
                        fileText: context?.activeFileContext?.fileText,
                        fileLanguage: context?.activeFileContext?.fileLanguage,
                        matchPolicy: context?.activeFileContext?.matchPolicy,
                        codeQuery: undefined,
                    },
                    triggerID
                )
            })
        } catch (e) {
            if (typeof e === 'string') {
                this.messenger.sendErrorMessage(e.toUpperCase(), message.tabID)
            } else if (e instanceof Error) {
                this.messenger.sendErrorMessage(e.message, message.tabID)
            }
        }
    }

    private async generateResponse(triggerPayload: TriggerPayload, triggerID: string) {
        // Loop while we waiting for tabID to be set
        const triggerEvent = this.triggerEventsStorage.getTriggerEvent(triggerID)
        if (triggerEvent === undefined) {
            return
        }
        if (triggerEvent.tabID === undefined) {
            setTimeout(() => {
                this.generateResponse(triggerPayload, triggerID)
            }, 20)
            return
        }

        const tabID = triggerEvent.tabID

        const editorContext: EditorContext = {
            fileContent: triggerPayload.fileText,
            language: triggerPayload.fileLanguage,
            query: triggerPayload.query,
            code: triggerPayload.code,
            context: {
                matchPolicy: triggerPayload.matchPolicy ?? {
                    should: [],
                    must: [],
                    mustNot: [],
                },
            },
            codeQuery: triggerPayload.codeQuery,
        }

        let response
        if (triggerPayload.trigger == ChatTriggerType.ChatMessage) {
            const chatRequest: ChatRequest = {
                message: triggerPayload.message ?? '',
                editorContext: editorContext,
                attachedSuggestions: [],
                attachedApiDocsSuggestions: [],
            }

            response = this.sessionStorage.getSession(tabID).chat(chatRequest)
        } else {
            const trigger = triggerPayload.trigger
            const ideTriggerRequest: IdeTriggerRequest = {
                trigger: trigger,
                editorContext,
            }

            response = this.sessionStorage.getSession(tabID).ideTrigger(ideTriggerRequest)
        }

        this.messenger.sendAIResponse(response, tabID, triggerID)
    }
}
