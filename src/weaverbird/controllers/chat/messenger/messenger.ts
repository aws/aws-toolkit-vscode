/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatMessage, ErrorMessage, FilePathMessage } from '../../../views/connector/connector'
import { AppToWebViewMessageDispatcher } from '../../../views/connector/connector'
import { ChatItemType } from '../../../models'
import { ChatItemFollowUp } from '@aws/mynah-ui-chat'

export interface ResponseProps {
    message?: string
    followUps?: ChatItemFollowUp[]
}

export class Messenger {
    public constructor(private readonly dispatcher: AppToWebViewMessageDispatcher) {}

    async sendResponse(response: ResponseProps, tabID: string) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: response.message,
                    messageType: ChatItemType.ANSWER,
                    followUps: response.followUps,
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

    public sendFilePaths(filePaths: string[], tabID: string) {
        this.dispatcher.sendFilePaths(new FilePathMessage(filePaths, tabID))
    }
}
