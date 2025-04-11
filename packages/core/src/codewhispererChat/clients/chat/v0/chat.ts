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
import { DocumentReference, PromptMessage } from '../../../controllers/chat/model'
import { FsWriteBackup } from '../../../../codewhispererChat/tools/fsWrite'
import { randomUUID } from '../../../../shared/crypto'

export type ToolUseWithError = {
    toolUse: ToolUse
    error: Error | undefined
}

export class ChatSession {
    private sessionId: string
    /**
     * _readFiles = list of files read from the project to gather context before generating response.
     * _showDiffOnFileWrite = Controls whether to show diff view (true) or file context view (false) to the user
     * _context = Additional context to be passed to the LLM for generating the response
     * _messageIdToUpdate = messageId of a chat message to be updated, used for reducing consecutive tool messages
     */
    private _readFiles: DocumentReference[] = []
    private _readFolders: DocumentReference[] = []
    private _toolUseWithError: ToolUseWithError | undefined
    private _showDiffOnFileWrite: boolean = false
    private _context: PromptMessage['context']
    private _pairProgrammingModeOn: boolean = true
    private _fsWriteBackups: Map<string, FsWriteBackup> = new Map()
    private _agenticLoopInProgress: boolean = false

    /**
     * True if messages from local history have been sent to session.
     */
    localHistoryHydrated: boolean = false
    private _messageIdToUpdate: string | undefined
    private _messageIdToUpdateListDirectory: string | undefined

    contexts: Map<string, { first: number; second: number }[]> = new Map()
    // TODO: doesn't handle the edge case when two files share the same relativePath string but from different root
    // e.g. root_a/file1 vs root_b/file1
    relativePathToWorkspaceRoot: Map<string, string> = new Map()
    public get sessionIdentifier(): string {
        return this.sessionId
    }
    public get messageIdToUpdate(): string | undefined {
        return this._messageIdToUpdate
    }

    public setMessageIdToUpdate(messageId: string | undefined) {
        this._messageIdToUpdate = messageId
    }

    public get messageIdToUpdateListDirectory(): string | undefined {
        return this._messageIdToUpdateListDirectory
    }

    public setMessageIdToUpdateListDirectory(messageId: string | undefined) {
        this._messageIdToUpdateListDirectory = messageId
    }

    public get agenticLoopInProgress(): boolean {
        return this._agenticLoopInProgress
    }

    public setAgenticLoopInProgress(value: boolean) {
        // When setting agenticLoop to false (ending the loop), dispose the current token source
        if (this._agenticLoopInProgress === true && value === false) {
            this.disposeTokenSource()
            // Create a new token source for future operations
            this.createNewTokenSource()
        }
        this._agenticLoopInProgress = value
    }

    /**
     * Safely disposes the current token source if it exists
     */
    disposeTokenSource() {
        if (this.tokenSource) {
            try {
                this.tokenSource.dispose()
            } catch (error) {
                getLogger().debug(`Error disposing token source: ${error}`)
            }
        }
    }

    public get pairProgrammingModeOn(): boolean {
        return this._pairProgrammingModeOn
    }

    public setPairProgrammingModeOn(pairProgrammingModeOn: boolean) {
        this._pairProgrammingModeOn = pairProgrammingModeOn
    }

    public get toolUseWithError(): ToolUseWithError | undefined {
        return this._toolUseWithError
    }

    public setToolUseWithError(toolUseWithError: ToolUseWithError | undefined) {
        this._toolUseWithError = toolUseWithError
    }

    public get context(): PromptMessage['context'] {
        return this._context
    }

    public setContext(context: PromptMessage['context']) {
        this._context = context
    }

    public get fsWriteBackups(): Map<string, FsWriteBackup> {
        return this._fsWriteBackups
    }

    public setFsWriteBackup(toolUseId: string, backup: FsWriteBackup) {
        this._fsWriteBackups.set(toolUseId, backup)
    }

    public tokenSource!: vscode.CancellationTokenSource

    constructor() {
        this.createNewTokenSource()
        this.sessionId = randomUUID()
    }

    createNewTokenSource() {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    public setSessionID(id: string) {
        this.sessionId = id
    }
    public get readFiles(): DocumentReference[] {
        return this._readFiles
    }
    public get readFolders(): DocumentReference[] {
        return this._readFolders
    }
    public get showDiffOnFileWrite(): boolean {
        return this._showDiffOnFileWrite
    }
    public setShowDiffOnFileWrite(value: boolean) {
        this._showDiffOnFileWrite = value
    }
    public addToReadFiles(filePath: DocumentReference) {
        this._readFiles.push(filePath)
    }
    public clearListOfReadFiles() {
        this._readFiles = []
    }
    public setReadFolders(folder: DocumentReference) {
        this._readFolders.push(folder)
    }
    public clearListOfReadFolders() {
        this._readFolders = []
    }
    async chatIam(chatRequest: SendMessageRequest): Promise<SendMessageCommandOutput> {
        const client = await createQDeveloperStreamingClient()

        const response = await client.sendMessage(chatRequest)
        if (!response.sendMessageResponse) {
            throw new ToolkitError(
                `Empty chat response. Session id: ${this.sessionId} Request ID: ${response.$metadata.requestId}`
            )
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

        UserWrittenCodeTracker.instance.onQFeatureInvoked()

        return response
    }
}
