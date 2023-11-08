/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FollowUpTypes } from '../../../types'
import {
    ChatMessage,
    AsyncEventProgressMessage,
    ErrorMessage,
    FilePathMessage,
    UpdatePlaceholderMessage,
    ChatInputEnabledMessage,
    AuthenticationUpdateMessage,
} from '../../../views/connector/connector'
import { AppToWebViewMessageDispatcher } from '../../../views/connector/connector'
import { ChatItemFollowUp } from '@aws/mynah-ui-chat'

export interface ResponseProps {
    message?: string
    followUps?: ChatItemFollowUp[]
    filePaths?: string[]
}

export class Messenger {
    public constructor(private readonly dispatcher: AppToWebViewMessageDispatcher) {}

    public sendAnswer(params: {
        message?: string
        type: 'answer' | 'answer-part' | 'answer-stream' | 'system-prompt'
        followUps?: ChatItemFollowUp[]
        tabID: string
    }) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: params.message,
                    messageType: params.type,
                    followUps: params.followUps,
                    relatedSuggestions: undefined,
                },
                params.tabID
            )
        )
    }

    public sendErrorMessage(errorMessage: string, tabID: string, retries: number) {
        if (retries === 0) {
            this.dispatcher.sendErrorMessage(
                new ErrorMessage(`We're unable to process your request at this time.`, errorMessage, tabID)
            )
            return
        }

        this.dispatcher.sendErrorMessage(
            new ErrorMessage('An error occured while processing your request.', errorMessage, tabID)
        )
        this.sendAnswer({
            message: undefined,
            type: 'answer',
            followUps: [
                {
                    pillText: 'Retry',
                    type: FollowUpTypes.Retry,
                },
            ],
            tabID,
        })
    }

    public sendFilePaths(filePaths: string[], tabID: string, uploadId: string) {
        this.dispatcher.sendFilePaths(new FilePathMessage(filePaths, tabID, uploadId))
    }

    public sendAsyncEventProgress(tabID: string, inProgress: boolean, message: string | undefined) {
        this.dispatcher.sendAsyncEventProgress(new AsyncEventProgressMessage(tabID, inProgress, message))
    }

    public sendUpdatePlaceholder(tabID: string, newPlaceholder: string) {
        this.dispatcher.sendPlaceholder(new UpdatePlaceholderMessage(tabID, newPlaceholder))
    }

    public sendChatInputEnabled(tabID: string, enabled: boolean) {
        this.dispatcher.sendChatInputEnabled(new ChatInputEnabledMessage(tabID, enabled))
    }

    public sendAuthenticationUpdate(weaverbirdEnabled: boolean) {
        this.dispatcher.sendAuthenticationUpdate(new AuthenticationUpdateMessage(weaverbirdEnabled))
    }
}
