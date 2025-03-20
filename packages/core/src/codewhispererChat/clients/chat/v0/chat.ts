/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SendMessageCommandOutput, SendMessageRequest } from '@amzn/amazon-q-developer-streaming-client'
import {
    ChatMessage,
    GenerateAssistantResponseCommandOutput,
    GenerateAssistantResponseRequest,
    ToolUse,
} from '@amzn/codewhisperer-streaming'
import * as vscode from 'vscode'
import { ToolkitError } from '../../../../shared/errors'
import { createCodeWhispererChatStreamingClient } from '../../../../shared/clients/codewhispererChatClient'
import { createQDeveloperStreamingClient } from '../../../../shared/clients/qDeveloperChatClient'
import { UserWrittenCodeTracker } from '../../../../codewhisperer/tracker/userWrittenCodeTracker'

export class ChatSession {
    private sessionId?: string
    private _toolUse: ToolUse | undefined
    private _chatHistory: ChatMessage[] = []
    private _listOfReadFiles: string[] = []

    contexts: Map<string, { first: number; second: number }[]> = new Map()
    // TODO: doesn't handle the edge case when two files share the same relativePath string but from different root
    // e.g. root_a/file1 vs root_b/file1
    relativePathToWorkspaceRoot: Map<string, string> = new Map()
    public get sessionIdentifier(): string | undefined {
        return this.sessionId
    }
    public get toolUse(): ToolUse | undefined {
        return this._toolUse
    }
    public get chatHistory(): ChatMessage[] {
        return this._chatHistory
    }
    public get listOfReadFiles(): string[] {
        return this._listOfReadFiles
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
    public setToolUse(toolUse: ToolUse | undefined) {
        this._toolUse = toolUse
    }
    public pushToChatHistory(message: ChatMessage | undefined) {
        if (message === undefined) {
            return
        }
        this._chatHistory.push(this.formatChatHistoryMessage(message))
    }
    public pushToListOfReadFiles(filePath: string) {
        this._listOfReadFiles.push(filePath)
    }

    private formatChatHistoryMessage(message: ChatMessage): ChatMessage {
        if (message.userInputMessage !== undefined) {
            return {
                userInputMessage: {
                    ...message.userInputMessage,
                    userInputMessageContext: {
                        ...message.userInputMessage.userInputMessageContext,
                        tools: undefined,
                    },
                },
            }
        }
        return message
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

        if (this.sessionId !== '' && this.sessionId !== undefined && chatRequest.conversationState !== undefined) {
            chatRequest.conversationState.conversationId = this.sessionId
        }

        const response = await client.generateAssistantResponse(chatRequest)
        // eslint-disable-next-line aws-toolkits/no-console-log
        console.log(response.$metadata.requestId)
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
