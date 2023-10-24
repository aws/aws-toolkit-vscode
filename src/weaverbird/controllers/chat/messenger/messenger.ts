/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatMessage, CodeGenerationMessage, ErrorMessage, FilePathMessage } from '../../../views/connector/connector'
import { AppToWebViewMessageDispatcher } from '../../../views/connector/connector'
import { ChatItemFollowUp } from '@aws/mynah-ui-chat'

export interface ResponseProps {
    message?: string
    followUps?: ChatItemFollowUp[]
    filePaths?: string[]
}

export class Messenger {
    public constructor(private readonly dispatcher: AppToWebViewMessageDispatcher) {}

    /**
     * Send a response to the UI
     *
     * Any failures that occur when attempting to resolve the request will automatically be handled
     */
    async sendResponse(request: () => Promise<ResponseProps>, tabID: string) {
        try {
            this.dispatcher.sendChatMessage(
                new ChatMessage(
                    {
                        message: '',
                        messageType: 'answer-stream',
                        followUps: undefined,
                        relatedSuggestions: undefined,
                    },
                    tabID
                )
            )

            const resp = await request()
            if (resp.message) {
                this.dispatcher.sendChatMessage(
                    new ChatMessage(
                        {
                            message: resp.message,
                            messageType: 'answer-part',
                            followUps: undefined,
                            relatedSuggestions: undefined,
                        },
                        tabID
                    )
                )
            }

            this.sendFollowUps(resp.followUps, tabID)
        } catch (err: any) {
            const errorMessage = `Weaverbird API request failed: ${err.cause?.message ?? err.message}`
            this.sendErrorMessage(errorMessage, tabID)
        }
    }

    public sendFollowUps(followUps: ChatItemFollowUp[] | undefined, tabID: string) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: undefined,
                    messageType: 'answer',
                    followUps: followUps,
                    relatedSuggestions: undefined,
                },
                tabID
            )
        )
    }

    public sendErrorMessage(errorMessage: string, tabID: string) {
        this.dispatcher.sendErrorMessage(
            new ErrorMessage('An error occured while processing your request.', errorMessage, tabID)
        )
    }

    public sendFilePaths(filePaths: string[], tabID: string, sessionID: string) {
        this.dispatcher.sendFilePaths(new FilePathMessage(filePaths, tabID, sessionID))
    }

    public sendCodeGeneration(tabID: string, inProgress: boolean) {
        this.dispatcher.sendCodeGeneration(new CodeGenerationMessage(tabID, inProgress))
    }
}
