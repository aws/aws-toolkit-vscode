/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeWhispererStreamingClient } from '../../../../shared/clients/codeWhispererChatStreamingClient'
import { AuthUtil } from '../../../../codewhisperer/util/authUtil'
import { ChatRequest, ChatResponseStream } from '@amzn/codewhisperer-streaming'
import * as vscode from 'vscode'
import { ToolkitError } from '../../../../shared/errors'

export class ChatSession {
    private _sessionId?: string
    public get sessionId(): string | undefined {
        return this._sessionId
    }

    public tokenSource!: vscode.CancellationTokenSource

    constructor() {
        this.createNewTokenSource()
    }

    createNewTokenSource() {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    async chat(chatRequest: ChatRequest): Promise<AsyncIterable<ChatResponseStream>> {
        if (AuthUtil.instance.isConnectionExpired()) {
            await AuthUtil.instance.showReauthenticatePrompt()
        }

        const client = await new CodeWhispererStreamingClient().createSdkClient()

        if (this.sessionId != undefined && chatRequest.conversationState != undefined) {
            chatRequest.conversationState.conversationId = this.sessionId
        }

        const response = await client.chat(chatRequest)
        if (!response.chatResponse) {
            throw new ToolkitError(`Empty chat response. Session id: ${this.sessionId}`)
        }

        // read the first event to get conversation id.
        // this assumes that the metadataEvent is the first event in the response stream.
        for await (const event of response.chatResponse) {
            if (event.messageMetadataEvent != undefined) {
                this._sessionId = event.messageMetadataEvent!.conversationId
            }
            break
        }

        return response.chatResponse
    }
}
