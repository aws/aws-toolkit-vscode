/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitUntil } from '../../../../shared/utilities/timeoutUtils'
import { ChatEvent } from '../../../clients/chat/v0/model'
import {
    ChatMessage,
    AppToWebViewMessageDispatcher,
    ErrorMessage,
    FollowUp,
    Suggestion,
    EditorContextCommandMessage,
} from '../../../view/connector/connector'

export class Messenger {
    public constructor(private readonly dispatcher: AppToWebViewMessageDispatcher) {}

    async sendAIResponse(response: AsyncGenerator<ChatEvent>, tabID: string, triggerID: string) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: '',
                    messageType: 'answer-stream',
                    followUps: undefined,
                    relatedSuggestions: undefined,
                    triggerID,
                },
                tabID
            )
        )

        let message = ''
        const followUps: FollowUp[] = []
        const relatedSuggestions: Suggestion[] = []

        await waitUntil(
            async () => {
                for await (const chatEvent of response) {
                    if (chatEvent.token != undefined) {
                        message += chatEvent.token

                        this.dispatcher.sendChatMessage(
                            new ChatMessage(
                                {
                                    message: message,
                                    messageType: 'answer-part',
                                    followUps: undefined,
                                    relatedSuggestions: undefined,
                                    triggerID,
                                },
                                tabID
                            )
                        )
                    }

                    if (chatEvent.suggestions != undefined) {
                        let suggestionIndex = 0
                        const newSuggestions: Suggestion[] = chatEvent.suggestions.map(
                            s =>
                                new Suggestion({
                                    title: s.title,
                                    url: s.url,
                                    body: s.body,
                                    id: suggestionIndex++,
                                    type: s.type,
                                    context: s.context,
                                })
                        )
                        relatedSuggestions.push(...newSuggestions)
                    }

                    if (chatEvent.followUps != undefined) {
                        chatEvent.followUps.forEach(element => {
                            if (element.pillText !== undefined) {
                                followUps.push({
                                    type: element.type.toString(),
                                    pillText: element.pillText,
                                    prompt: element.prompt ?? element.pillText,
                                })
                            }

                            if (element.message !== undefined) {
                                followUps.push({
                                    type: element.type.toString(),
                                    pillText: element.message,
                                    prompt: element.message,
                                })
                            }
                        })
                    }
                }
                return true
            },
            { timeout: 10000, truthy: true }
        )

        if (relatedSuggestions.length !== 0) {
            this.dispatcher.sendChatMessage(
                new ChatMessage(
                    {
                        message: undefined,
                        messageType: 'answer-part',
                        followUps: undefined,
                        relatedSuggestions,
                        triggerID,
                    },
                    tabID
                )
            )
        }

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: undefined,
                    messageType: 'answer',
                    followUps: followUps,
                    relatedSuggestions: undefined,
                    triggerID,
                },
                tabID
            )
        )
    }

    public sendErrorMessage(errorMessage: string | undefined, tabID: string) {
        this.showChatExceptionMessage(
            {
                errorMessage: errorMessage,
                sessionID: undefined,
                statusCode: undefined,
            },
            tabID
        )
    }

    public sendEditorContextCommandMessage(message: string, triggerID: string) {
        this.dispatcher.sendEditorContextCommandMessage(new EditorContextCommandMessage({ message, triggerID }))
    }

    private showChatExceptionMessage(e: ChatException, tabID: string) {
        let message = 'This error is reported to the team automatically. We will attempt to fix it as soon as possible.'
        if (e.errorMessage != undefined) {
            message += '\n\nDetails: ' + e.errorMessage
        }

        if (e.statusCode != undefined) {
            message += '\n\nStatus Code: ' + e.statusCode
        }
        if (e.sessionID != undefined) {
            message += '\n\nSession ID: ' + e.sessionID
        }
        this.dispatcher.sendErrorMessage(
            new ErrorMessage('An error occurred while processing your request.', message.trimEnd().trimStart(), tabID)
        )
    }
}
