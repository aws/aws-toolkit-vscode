/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { EditorContextExtractor, TriggerType } from '../../editor/context/extractor'
import { ChatSessionStorage } from '../../storages/chatSession'
import { ChatRequest, EditorContext, IdeTriggerRequest } from '../../clients/chat/v0/model'
import { Messenger } from './messenger/messenger'
import { PromptMessage, ChatTriggerType, TriggerPayload } from './model'
import { Connector } from '../../view/connector/connector'

export interface ChatControllerEventEmitters {
    readonly processHumanChatMessage: EventEmitter<PromptMessage>
}

export class ChatController {
    private readonly sessionStorage: ChatSessionStorage
    private readonly messenger: Messenger
    private readonly editorContextExtractor: EditorContextExtractor

    public constructor(
        private readonly chatControllerEventEmitters: ChatControllerEventEmitters,
        uiOutputEventEmitter: EventEmitter<any>
    ) {
        this.sessionStorage = new ChatSessionStorage()
        this.messenger = new Messenger(new Connector(uiOutputEventEmitter))
        this.editorContextExtractor = new EditorContextExtractor()

        this.chatControllerEventEmitters.processHumanChatMessage.event(data => {
            this.processHumanChatMessage(data)
        })
    }

    public run() {}

    public async processHumanChatMessage(message: PromptMessage) {
        if (message.message == undefined) {
            this.messenger.sendErrorMessage('chatMessage should be set', message.tabID)
            return
        }

        try {
            await this.processHumanMessageAsNewThread(message)
        } catch (e) {
            if (typeof e === 'string') {
                this.messenger.sendErrorMessage(e.toUpperCase(), message.tabID)
            } else if (e instanceof Error) {
                this.messenger.sendErrorMessage(e.message, message.tabID)
            }
        }
    }

    private async processHumanMessageAsNewThread(message: PromptMessage) {
        try {
            this.editorContextExtractor.extractContextForTrigger(TriggerType.ChatMessage).then(context => {
                this.generateResponse(
                    {
                        message: message.message,
                        trigger: ChatTriggerType.ChatMessage,
                        query: undefined,
                        code: undefined,
                        fileText: context?.activeFileContext?.fileText,
                        fileLanguage: context?.activeFileContext?.fileLanguage,
                        matchPolicy: context?.activeFileContext?.matchPolicy,
                    },
                    message.tabID
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

    private async generateResponse(triggerPayload: TriggerPayload, tabID: string) {
        const editorContext: EditorContext = {
            fileContent: triggerPayload.fileText,
            language: triggerPayload.fileLanguage,
            query: triggerPayload.query,
            code: triggerPayload.code, // or codeSelection
            context: {
                matchPolicy: triggerPayload.matchPolicy,
            },
            // todo: codeQuery
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

        this.messenger.sendResponse(response, tabID)
    }
}
