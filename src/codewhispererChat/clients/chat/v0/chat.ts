/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeWhispererStreamingClient } from '../../../../shared/clients/codeWhispererChatStreamingClient'
import {
    CodeWhispererStreaming,
    GenerateAssistantResponseCommandOutput,
    GenerateAssistantResponseRequest,
} from '@amzn/codewhisperer-streaming'
import * as vscode from 'vscode'
import { ToolkitError } from '../../../../shared/errors'

export class ChatSession {
    private sessionId?: string
    private client: CodeWhispererStreaming | undefined
    public get sessionIdentifier(): string | undefined {
        return this.sessionId
    }

    public tokenSource!: vscode.CancellationTokenSource

    constructor() {
        this.createNewTokenSource()
    }

    createNewTokenSource() {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    public setSessionID(id?: string) {
        this.sessionId = id
    }

    async chat(chatRequest: GenerateAssistantResponseRequest): Promise<GenerateAssistantResponseCommandOutput> {
        this.client = await new CodeWhispererStreamingClient().createSdkClient()

        if (this.sessionId !== undefined && chatRequest.conversationState !== undefined) {
            chatRequest.conversationState.conversationId = this.sessionId
        }

        const response = await this.client.generateAssistantResponse(chatRequest)
        if (!response.generateAssistantResponseResponse) {
            throw new ToolkitError(
                `Empty chat response. Session id: ${this.sessionId} Request ID: ${response.$metadata.requestId}`
            )
        }

        return response
    }
}
