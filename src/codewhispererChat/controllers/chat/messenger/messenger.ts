/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatEvent } from '../../../clients/chat/v0/model'
import { ChatMessage, Connector, ErrorMessage, FollowUp, Suggestion } from '../../../view/connector/connector'

export class Messenger {
    public constructor(private readonly connector: Connector) {}

    async sendResponse(response: AsyncGenerator<ChatEvent>, tabID: string) {
        this.connector.sendChatMessage(
            new ChatMessage(
                {
                    message: '',
                    messageType: 'answer-stream',
                    followUps: undefined,
                    searchResults: undefined,
                    relatedSuggestions: undefined,
                },
                tabID
            )
        )

        let message = ''
        const followUps: FollowUp[] = []

        for await (const chatEvent of response) {
            if (chatEvent.token != undefined) {
                message += chatEvent.token

                this.connector.sendChatMessage(
                    new ChatMessage(
                        {
                            message: message,
                            messageType: 'answer-part',
                            followUps: undefined,
                            relatedSuggestions: undefined,
                            searchResults: undefined,
                        },
                        tabID
                    )
                )
            }

            if (chatEvent.suggestions != undefined) {
                const relatedSuggestions: Suggestion[] = []
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

                this.connector.sendChatMessage(
                    new ChatMessage(
                        {
                            message: undefined,
                            messageType: 'answer-part',
                            followUps: undefined,
                            // TODO: Fix it on the backend side and delete this workaround
                            searchResults: undefined,
                            relatedSuggestions: relatedSuggestions.length == 0 ? undefined : relatedSuggestions,
                        },
                        tabID
                    )
                )
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

            //TODO: reassigne the query
        }

        this.connector.sendChatMessage(
            new ChatMessage(
                {
                    message: undefined,
                    messageType: 'answer',
                    followUps: followUps,
                    // TODO: Fix it on the backend side and delete this workaround
                    searchResults: undefined,
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
