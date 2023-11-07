/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'

import { collectFiles } from '../util/files'
import { CodeGenState, ConversationNotStartedState, PrepareRefinementState } from './sessionState'
import type { Interaction, SessionState, SessionStateConfig } from '../types'
import { ConversationIdNotFoundError } from '../errors'
import { weaverbirdScheme } from '../constants'
import { FileSystemCommon } from '../../srcShared/fs'
import { Messenger } from '../controllers/chat/messenger/messenger'
import { WeaverbirdClient } from '../client/weaverbird'
import { approachRetryLimit, codeGenRetryLimit } from '../limits'
import { SessionConfig } from './sessionConfigFactory'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { telemetry } from '../../shared/telemetry/telemetry'

const fs = FileSystemCommon.instance

export class Session {
    private _state?: SessionState | Omit<SessionState, 'uploadId'>
    private task: string = ''
    private approach: string = ''
    private proxyClient: WeaverbirdClient
    private _conversationId?: string
    private approachRetries: number
    private codeGenRetries: number
    private preloaderFinished = false
    private _latestMessage: string = ''

    constructor(public readonly config: SessionConfig, private messenger: Messenger, private readonly tabID: string) {
        this._state = new ConversationNotStartedState('', tabID)
        this.proxyClient = new WeaverbirdClient()

        this.approachRetries = approachRetryLimit
        this.codeGenRetries = codeGenRetryLimit
    }

    /**
     * Preload any events that have to run before a chat message can be sent
     */
    async preloader(msg: string) {
        if (!this.preloaderFinished) {
            await this.setupConversation(msg)
            this.preloaderFinished = true

            telemetry.awsq_assignCommand.emit({ awsqConversationId: this.conversationId, value: 1 })

            const extensionVersion = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)?.packageJSON.version
            this.messenger.sendAsyncEventProgress(
                this.tabID,
                true,
                `Your conversation has been started:
<pre><code>Conversation ID: ${this.conversationId}  
aws-toolkit-vscode version: ${extensionVersion}</code></pre>
`
            )
        }
    }

    /**
     * setupConversation
     *
     * Starts a conversation with the backend and uploads the repo for the LLMs to be able to use it.
     */
    private async setupConversation(msg: string) {
        // Store the initial message when setting up the conversation so that if it fails we can retry with this message
        this._latestMessage = msg

        this._conversationId = await this.proxyClient.createConversation()

        this._state = new PrepareRefinementState(
            {
                ...this.getSessionStateConfig(),
                conversationId: this.conversationId,
            },
            '',
            this.tabID
        )
    }

    private getSessionStateConfig(): Omit<SessionStateConfig, 'uploadId'> {
        return {
            llmConfig: this.config.llmConfig,
            workspaceRoot: this.config.workspaceRoot,
            proxyClient: this.proxyClient,
            conversationId: this.conversationId,
        }
    }

    /**
     * Triggered by the Write Code follow up button to move to the code generation phase
     */
    initCodegen(): void {
        this._state = new CodeGenState(
            {
                ...this.getSessionStateConfig(),
                conversationId: this.conversationId,
                uploadId: this.uploadId,
            },
            this.approach,
            this.tabID
        )
        this._latestMessage = ''
    }

    async send(msg: string | undefined): Promise<Interaction> {
        // When the task/"thing to do" hasn't been set yet, we want it to be the incoming message
        if (this.task === '' && msg) {
            this.task = msg
        }

        if (msg) {
            this._latestMessage = msg
        }

        return this.nextInteraction(msg)
    }

    private async nextInteraction(msg: string | undefined) {
        const files = await collectFiles(this.config.workspaceRoot)

        const resp = await this.state.interact({
            files,
            task: this.task,
            msg,
            fs: this.config.fs,
            messenger: this.messenger,
        })

        if (resp.nextState) {
            // Approach may have been changed after the interaction
            const newApproach = this.state.approach

            // Cancel the request before moving to a new state
            this.state.tokenSource.cancel()

            // Move to the next state
            this._state = resp.nextState

            // If approach was changed then we need to set it in the next state and this state
            this.state.approach = newApproach
            this.approach = newApproach
        }

        return resp.interaction
    }

    public async acceptChanges() {
        const uploadId = this.uploadId
        for (const filePath of this.state.filePaths ?? []) {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(this.config.workspaceRoot, filePath)

            const uri = vscode.Uri.from({ scheme: weaverbirdScheme, path: path.join(uploadId, filePath) })
            const content = await this.config.fs.readFile(uri)
            const decodedContent = new TextDecoder().decode(content)

            await fs.mkdir(path.dirname(absolutePath))
            await fs.writeFile(absolutePath, decodedContent)
        }
    }

    get state() {
        if (!this._state) {
            throw new Error("State should be initialized before it's read")
        }
        return this._state
    }

    get uploadId() {
        if (!('uploadId' in this.state)) {
            throw new Error("UploadId has to be initialized before it's read")
        }
        return this.state.uploadId
    }

    get retries() {
        switch (this.state.phase) {
            case 'Approach':
                return this.approachRetries
            case 'Codegen':
                return this.codeGenRetries
            default:
                return this.approachRetries
        }
    }

    decreaseRetries() {
        switch (this.state.phase) {
            case 'Approach':
                this.approachRetries -= 1
                break
            case 'Codegen':
                this.codeGenRetries -= 1
                break
        }
    }
    get conversationId() {
        if (!this._conversationId) {
            throw new ConversationIdNotFoundError()
        }
        return this._conversationId
    }

    get latestMessage() {
        return this._latestMessage
    }
}
