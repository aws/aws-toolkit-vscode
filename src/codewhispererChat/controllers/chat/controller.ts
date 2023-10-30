/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EditorContextExtractor, TriggerType } from '../../editor/context/extractor'
import { ChatSessionStorage } from '../../storages/chatSession'
import { Messenger } from './messenger/messenger'
import {
    PromptMessage,
    ChatTriggerType,
    TriggerPayload,
    TabClosedMessage,
    InsertCodeAtCursorPosition,
    TriggerTabIDReceived,
    StopResponseMessage,
} from './model'
import { AppToWebViewMessageDispatcher } from '../../view/connector/connector'
import { MessagePublisher } from '../../../awsq/messages/messagePublisher'
import { MessageListener } from '../../../awsq/messages/messageListener'
import { EditorContentController } from '../../editor/context/contentController'
import { EditorContextCommand } from '../../commands/registerCommands'
import { PromptsGenerator } from './prompts/promptsGenerator'
import { TriggerEventsStorage } from '../../storages/triggerEvents'
import { randomUUID } from 'crypto'
import { ChatRequest, CursorState, DocumentSymbol, SymbolType, TextDocument } from '@amzn/codewhisperer-streaming'
import { UserIntentRecognizer } from './userIntent/userIntentRecognizer'

export interface ChatControllerMessagePublishers {
    readonly processPromptChatMessage: MessagePublisher<PromptMessage>
    readonly processTabClosedMessage: MessagePublisher<TabClosedMessage>
    readonly processInsertCodeAtCursorPosition: MessagePublisher<InsertCodeAtCursorPosition>
    readonly processContextMenuCommand: MessagePublisher<EditorContextCommand>
    readonly processTriggerTabIDReceived: MessagePublisher<TriggerTabIDReceived>
    readonly processStopResponseMessage: MessagePublisher<StopResponseMessage>
}

export interface ChatControllerMessageListeners {
    readonly processPromptChatMessage: MessageListener<PromptMessage>
    readonly processTabClosedMessage: MessageListener<TabClosedMessage>
    readonly processInsertCodeAtCursorPosition: MessageListener<InsertCodeAtCursorPosition>
    readonly processContextMenuCommand: MessageListener<EditorContextCommand>
    readonly processTriggerTabIDReceived: MessageListener<TriggerTabIDReceived>
    readonly processStopResponseMessage: MessageListener<StopResponseMessage>
}

export class ChatController {
    private readonly sessionStorage: ChatSessionStorage
    private readonly triggerEventsStorage: TriggerEventsStorage
    private readonly messenger: Messenger
    private readonly editorContextExtractor: EditorContextExtractor
    private readonly editorContentController: EditorContentController
    private readonly promptGenerator: PromptsGenerator
    private readonly userIntentRecognizer: UserIntentRecognizer

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
        this.userIntentRecognizer = new UserIntentRecognizer()

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

        this.chatControllerMessageListeners.processStopResponseMessage.onMessage(data => {
            this.processStopResponseMessage(data)
        })
    }

    private async processStopResponseMessage(message: StopResponseMessage) {
        const session = this.sessionStorage.getSession(message.tabID)
        session.tokenSource.cancel()
    }

    private async processTriggerTabIDReceived(message: TriggerTabIDReceived) {
        this.triggerEventsStorage.updateTriggerEventTabIDFromUnknown(message.triggerID, message.tabID)
    }

    private async processInsertCodeAtCursorPosition(message: InsertCodeAtCursorPosition) {
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
                    context?.focusAreaContext?.codeBlock ?? ''
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
                        message: prompt,
                        trigger: ChatTriggerType.ChatMessage,
                        query: undefined,
                        codeSelection: context?.focusAreaContext?.selectionInsideExtendedCodeBlock,
                        fileText: context?.focusAreaContext?.extendedCodeBlock,
                        fileLanguage: context?.activeFileContext?.fileLanguage,
                        filePath: context?.activeFileContext?.filePath,
                        matchPolicy: context?.activeFileContext?.matchPolicy,
                        codeQuery: context?.focusAreaContext?.names,
                        userIntent: this.userIntentRecognizer.getUserIntentFromContextMenuCommand(command),
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
                        codeSelection: context?.focusAreaContext?.selectionInsideExtendedCodeBlock,
                        fileText: context?.focusAreaContext?.extendedCodeBlock,
                        fileLanguage: context?.activeFileContext?.fileLanguage,
                        filePath: context?.activeFileContext?.filePath,
                        matchPolicy: context?.activeFileContext?.matchPolicy,
                        codeQuery: context?.focusAreaContext?.names,
                        userIntent: this.userIntentRecognizer.getUserIntentFromPromptChatMessage(message),
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
        const request = this.triggerPayloadToChatRequest(triggerPayload)
        const session = this.sessionStorage.getSession(tabID)
        session.createNewTokenSource()
        try {
            const response = await session.chat(request)
            this.messenger.sendAIResponse(response, session, tabID, triggerID)
        } catch (e) {
            if (typeof e === 'string') {
                this.messenger.sendErrorMessage(e.toUpperCase(), tabID)
            } else if (e instanceof Error) {
                this.messenger.sendErrorMessage(e.message, tabID)
            }
        }
    }

    private triggerPayloadToChatRequest(triggerPayload: TriggerPayload): ChatRequest {
        let document: TextDocument | undefined = undefined
        let cursorState: CursorState | undefined = undefined

        if (triggerPayload.filePath !== undefined || triggerPayload.filePath !== '') {
            const documentSymbolFqns: DocumentSymbol[] = []
            triggerPayload.codeQuery?.fullyQualifiedNames?.used?.forEach(fqn => {
                documentSymbolFqns.push({
                    name: fqn.symbol?.join('.'),
                    type: SymbolType.USAGE,
                    source: fqn.source?.join('.'),
                })
            })

            let programmingLanguage = undefined
            if (triggerPayload.fileLanguage != undefined && triggerPayload.fileLanguage != '') {
                programmingLanguage = { languageName: triggerPayload.fileLanguage }
            }

            document = {
                relativeFilePath: triggerPayload.filePath,
                text: triggerPayload.fileText,
                programmingLanguage,
                // TODO: Fix it
                // documentSymbols: documentSymbolFqns,
            }

            if (triggerPayload.codeSelection?.start) {
                cursorState = {
                    range: {
                        start: {
                            line: triggerPayload.codeSelection.start.line,
                            character: triggerPayload.codeSelection.start.character,
                        },
                        end: {
                            line: triggerPayload.codeSelection.end.line,
                            character: triggerPayload.codeSelection.end.character,
                        },
                    },
                }
            }
        }

        return {
            conversationState: {
                currentMessage: {
                    userInputMessage: {
                        content: triggerPayload.message ?? '',
                        userInputMessageContext: {
                            editorState: {
                                document,
                                cursorState,
                            },
                        },
                        userIntent: triggerPayload.userIntent,
                    },
                },
                chatTriggerType: 'MANUAL',
            },
        }
    }
}
