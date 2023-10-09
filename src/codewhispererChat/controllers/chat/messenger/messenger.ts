/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatEvent } from '../../../clients/chat/v0/model'
import {
    ChatMessage,
    ChatMessageType,
    Connector,
    ErrorMessage,
    FollowUp,
    Suggestion,
} from '../../../view/connector/connector'

export class Messenger {
    public constructor(private readonly connector: Connector) {}

    async sendResponse(response: AsyncGenerator<ChatEvent>, tabID: string) {
        this.connector.sendChatMessage(
            new ChatMessage(
                {
                    message: '',
                    messageType: ChatMessageType.BeginStream,
                    followUps: undefined,
                    relatedSuggestions: undefined,
                },
                tabID
            )
        )

        let message = ''
        const followUps: FollowUp[] = []
        const relatedSuggestions: Suggestion[] = []

        for await (const chatEvent of response) {
            if (chatEvent.token != undefined) {
                message += chatEvent.token

                this.connector.sendChatMessage(
                    new ChatMessage(
                        {
                            message: message,
                            messageType: ChatMessageType.StreamPart,
                            followUps: undefined,
                            relatedSuggestions: undefined,
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

        if (relatedSuggestions.length !== 0) {
            this.connector.sendChatMessage(
                new ChatMessage(
                    {
                        message: undefined,
                        messageType: ChatMessageType.StreamPart,
                        followUps: undefined,
                        relatedSuggestions,
                    },
                    tabID
                )
            )
        }

        this.connector.sendChatMessage(
            new ChatMessage(
                {
                    message: undefined,
                    messageType: ChatMessageType.Answer,
                    followUps: followUps,
                    relatedSuggestions: undefined,
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
        this.connector.sendErrorMessage(
            new ErrorMessage('An error occurred while processing your request.', message.trimEnd().trimStart(), tabID)
        )
    }
}
