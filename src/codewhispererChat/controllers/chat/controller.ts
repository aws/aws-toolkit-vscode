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
import { ChatRequest, DocumentSymbol, UserIntent } from '@amzn/codewhisperer-streaming'
import { CwsprChatTriggerInteraction, CwsprChatUserIntent, telemetry } from '../../../shared/telemetry/telemetry'

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

    private getUserIntentFromContextMenuCommand(command: EditorContextCommand): UserIntent | undefined {
        switch (command) {
            case 'aws.awsq.explainCode':
                return UserIntent.EXPLAIN_CODE_SELECTION
            case 'aws.awsq.refactorCode':
                return UserIntent.SUGGEST_ALTERNATE_IMPLEMENTATION
            case 'aws.awsq.fixCode':
                return UserIntent.APPLY_COMMON_BEST_PRACTICES
            case 'aws.awsq.optimizeCode':
                return UserIntent.IMPROVE_CODE
            default:
                return undefined
        }
    }

    private getUserIntentForTelemetry(userIntent: UserIntent | undefined): CwsprChatUserIntent | undefined {
        switch (userIntent) {
            case UserIntent.EXPLAIN_CODE_SELECTION:
                return 'explainCodeSelection'
            case UserIntent.SUGGEST_ALTERNATE_IMPLEMENTATION:
                return 'suggestAlternateImplementation'
            case UserIntent.APPLY_COMMON_BEST_PRACTICES:
                return 'applyCommonBestPractices'
            case UserIntent.IMPROVE_CODE:
                return 'improveCode'
            default:
                return undefined
        }
    }

    private getUserIntentFromPromptChatMessage(prompt: PromptMessage): UserIntent | undefined {
        if (prompt.message?.startsWith('Explain')) {
            return UserIntent.EXPLAIN_CODE_SELECTION
        } else if (prompt.message?.startsWith('Refactor')) {
            return UserIntent.SUGGEST_ALTERNATE_IMPLEMENTATION
        } else if (prompt.message?.startsWith('Fix')) {
            return UserIntent.APPLY_COMMON_BEST_PRACTICES
        } else if (prompt.message?.startsWith('Optimize')) {
            return UserIntent.IMPROVE_CODE
        }
        return undefined
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
                        message: prompt,
                        trigger: ChatTriggerType.ChatMessage,
                        query: undefined,
                        code: context?.codeSelectionContext?.selectedCode,
                        fileText: context?.activeFileContext?.fileText,
                        fileLanguage: context?.activeFileContext?.fileLanguage,
                        matchPolicy: context?.activeFileContext?.matchPolicy,
                        codeQuery: context?.codeSelectionContext?.names,
                        userIntent: this.getUserIntentFromContextMenuCommand(command),
                    },
                    triggerID,
                    'contextMenu'
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
                        userIntent: this.getUserIntentFromPromptChatMessage(message),
                    },
                    triggerID,
                    'click'
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

    private async generateResponse(
        triggerPayload: TriggerPayload,
        triggerID: string,
        triggerType: CwsprChatTriggerInteraction
    ) {
        // Loop while we waiting for tabID to be set
        const triggerEvent = this.triggerEventsStorage.getTriggerEvent(triggerID)
        if (triggerEvent === undefined) {
            return
        }
        if (triggerEvent.tabID === undefined) {
            setTimeout(() => {
                this.generateResponse(triggerPayload, triggerID, triggerType)
            }, 20)
            return
        }

        const tabID = triggerEvent.tabID
        const request = this.triggerPayloadToChatRequest(triggerPayload)
        const session = this.sessionStorage.getSession(tabID)
        session.createNewTokenSource()
        try {
            telemetry.codewhispererchat_startConversation.run(async span => {
                span.record({
                    cwsprChatTriggerInteraction: triggerType,
                    cwsprChatHasCodeSnippet: triggerPayload.code != undefined,
                    cwsprChatProgrammingLanguage: triggerPayload.fileLanguage,
                })

                const telemetryUserIntent = this.getUserIntentForTelemetry(triggerPayload.userIntent)
                if (telemetryUserIntent) {
                    span.record({ cwsprChatUserIntent: telemetryUserIntent })
                }

                const response = await session.chat(request)
                // TODO: record conversation type
                telemetry.codewhispererchat_startConversation.record({ cwsprChatConversationId: session.sessionId })
                this.messenger.sendAIResponse(response, session, tabID, triggerID)
            })
        } catch (e) {
            if (typeof e === 'string') {
                this.messenger.sendErrorMessage(e.toUpperCase(), tabID)
            } else if (e instanceof Error) {
                this.messenger.sendErrorMessage(e.message, tabID)
            }
        }
    }

    private triggerPayloadToChatRequest(triggerPayload: TriggerPayload): ChatRequest {
        const documentSymbolFqns: DocumentSymbol[] = []
        triggerPayload.codeQuery?.fullyQualifiedNames?.used?.forEach(fqn => {
            documentSymbolFqns.push({
                name: fqn.symbol?.join('.'),
                type: undefined,
                source: fqn.source?.join('.'),
            })
        })
        if (triggerPayload.trigger == ChatTriggerType.ChatMessage) {
            return {
                conversationState: {
                    currentMessage: {
                        userInputMessage: {
                            content: triggerPayload.message ?? '',
                            userInputMessageContext: {
                                editorState: {
                                    document: {
                                        // TODO : replace with actual relative file path once available in trigger payload
                                        relativeFilePath: './test.py',
                                        text: triggerPayload.fileText,
                                        programmingLanguage: { languageName: triggerPayload.fileLanguage },
                                        documentSymbols: documentSymbolFqns,
                                    },
                                    cursorState: {
                                        position: { line: 0, character: 0 },
                                    },
                                },
                            },
                            userIntent: triggerPayload.userIntent,
                        },
                    },
                    chatTriggerType: 'MANUAL',
                },
            }
        } else {
            return {
                conversationState: {
                    currentMessage: {
                        userInputMessage: {
                            content: triggerPayload.message ?? '',
                            userInputMessageContext: {
                                editorState: {
                                    document: {
                                        relativeFilePath: '',
                                        text: triggerPayload.fileText,
                                        programmingLanguage: { languageName: triggerPayload.fileLanguage },
                                        documentSymbols: documentSymbolFqns,
                                    },
                                    cursorState: {
                                        position: { line: 0, character: 0 },
                                    },
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
}
