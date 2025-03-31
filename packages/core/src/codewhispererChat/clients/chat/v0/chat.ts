/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SendMessageCommandOutput, SendMessageRequest } from '@amzn/amazon-q-developer-streaming-client'
import { GenerateAssistantResponseCommandOutput, GenerateAssistantResponseRequest } from '@amzn/codewhisperer-streaming'
import * as vscode from 'vscode'
import { ToolkitError } from '../../../../shared/errors'
import { createCodeWhispererChatStreamingClient } from '../../../../shared/clients/codewhispererChatClient'
import { createQDeveloperStreamingClient } from '../../../../shared/clients/qDeveloperChatClient'
import { UserWrittenCodeTracker } from '../../../../codewhisperer/tracker/userWrittenCodeTracker'

export class ChatSession {
    private sessionId?: string
    /**
     * True if messages from local history have been sent to session.
     */
    localHistoryHydrated: boolean = false

    contexts: Map<string, { first: number; second: number }[]> = new Map()
    // TODO: doesn't handle the edge case when two files share the same relativePath string but from different root
    // e.g. root_a/file1 vs root_b/file1
    relativePathToWorkspaceRoot: Map<string, string> = new Map()
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
    async chatIam(chatRequest: SendMessageRequest): Promise<SendMessageCommandOutput> {
        const client = await createQDeveloperStreamingClient()

        const response = await client.sendMessage(chatRequest)
        if (!response.sendMessageResponse) {
            throw new ToolkitError(
                `Empty chat response. Session id: ${this.sessionId} Request ID: ${response.$metadata.requestId}`
            )
        }

        const responseStream = response.sendMessageResponse
        for await (const event of responseStream) {
            if ('messageMetadataEvent' in event) {
                this.sessionId = event.messageMetadataEvent?.conversationId
                break
            }
        }

        UserWrittenCodeTracker.instance.onQFeatureInvoked()
        return response
    }

    async chatSso(chatRequest: GenerateAssistantResponseRequest): Promise<GenerateAssistantResponseCommandOutput> {
        const client = await createCodeWhispererChatStreamingClient()

        if (this.sessionId !== undefined && chatRequest.conversationState !== undefined) {
            chatRequest.conversationState.conversationId = this.sessionId
        }

        const response = await client.generateAssistantResponse(chatRequest)
        if (!response.generateAssistantResponseResponse) {
            throw new ToolkitError(
                `Empty chat response. Session id: ${this.sessionId} Request ID: ${response.$metadata.requestId}`
            )
        }

        this.sessionId = response.conversationId

        UserWrittenCodeTracker.instance.onQFeatureInvoked()

        return response
    }
}
