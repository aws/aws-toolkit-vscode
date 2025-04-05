/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SendMessageCommandOutput, SendMessageRequest } from '@amzn/amazon-q-developer-streaming-client'
import {
    GenerateAssistantResponseCommandOutput,
    GenerateAssistantResponseRequest,
    ToolUse,
} from '@amzn/codewhisperer-streaming'
import * as vscode from 'vscode'
import { ToolkitError } from '../../../../shared/errors'
import { createCodeWhispererChatStreamingClient } from '../../../../shared/clients/codewhispererChatClient'
import { createQDeveloperStreamingClient } from '../../../../shared/clients/qDeveloperChatClient'
import { UserWrittenCodeTracker } from '../../../../codewhisperer/tracker/userWrittenCodeTracker'
import { PromptMessage } from '../../../controllers/chat/model'

export class ChatSession {
    private sessionId?: string
    /**
     * _readFiles = list of files read from the project to gather context before generating response.
     * _showDiffOnFileWrite = Controls whether to show diff view (true) or file context view (false) to the user
     * _context = Additional context to be passed to the LLM for generating the response
     * _messageIdToUpdate = messageId of a chat message to be updated, used for reducing consecutive tool messages
     */
    private _readFiles: string[] = []
    private _toolUse: ToolUse | undefined
    private _showDiffOnFileWrite: boolean = false
    private _context: PromptMessage['context']
    private _pairProgrammingModeOn: boolean = true
    private _messageIdToUpdate: string | undefined

    contexts: Map<string, { first: number; second: number }[]> = new Map()
    // TODO: doesn't handle the edge case when two files share the same relativePath string but from different root
    // e.g. root_a/file1 vs root_b/file1
    relativePathToWorkspaceRoot: Map<string, string> = new Map()
    public get sessionIdentifier(): string | undefined {
        return this.sessionId
    }

    public get pairProgrammingModeOn(): boolean {
        return this._pairProgrammingModeOn
    }

    public setPairProgrammingModeOn(pairProgrammingModeOn: boolean) {
        this._pairProgrammingModeOn = pairProgrammingModeOn
    }

    public get toolUse(): ToolUse | undefined {
        return this._toolUse
    }

    public setToolUse(toolUse: ToolUse | undefined) {
        this._toolUse = toolUse
    }

    public get context(): PromptMessage['context'] {
        return this._context
    }

    public setContext(context: PromptMessage['context']) {
        this._context = context
    }

    public get messageIdToUpdate(): string | undefined {
        return this._messageIdToUpdate
    }

    public setMessageIdToUpdate(messageId: string | undefined) {
        this._messageIdToUpdate = messageId
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
    public get readFiles(): string[] {
        return this._readFiles
    }
    public get showDiffOnFileWrite(): boolean {
        return this._showDiffOnFileWrite
    }
    public setShowDiffOnFileWrite(value: boolean) {
        this._showDiffOnFileWrite = value
    }
    public addToReadFiles(filePath: string) {
        this._readFiles.push(filePath)
    }
    public clearListOfReadFiles() {
        this._readFiles = []
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
