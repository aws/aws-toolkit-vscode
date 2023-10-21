/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'

import { collectFiles, getSourceCodePath, prepareRepoData } from '../util/files'
import { CodeGenState, RefinementState } from './sessionState'
import type { Interaction, SessionState, SessionStateConfig } from '../types'
import { SessionConfig } from './sessionConfig'
import { ConversationIdNotFoundError } from '../errors'
import { weaverbirdScheme } from '../constants'
import { FileSystemCommon } from '../../srcShared/fs'
import { Messenger } from '../controllers/chat/messenger/messenger'
import { uploadCode } from '../util/upload'
import { WeaverbirdLambdaClient } from '../client/weaverbird'

const fs = FileSystemCommon.instance

export class Session {
    private _state: SessionState
    private task: string = ''
    private approach: string = ''
    public readonly config: SessionConfig
    private readonly tabID: string
    private lambdaClient: WeaverbirdLambdaClient

    private messenger: Messenger

    constructor(sessionConfig: SessionConfig, messenger: Messenger, tabID: string) {
        this.config = sessionConfig
        this.tabID = tabID
        this._state = new RefinementState(this.getSessionStateConfig(), '', tabID)
        this.messenger = messenger
        this.lambdaClient = new WeaverbirdLambdaClient(sessionConfig.client, sessionConfig.backendConfig.lambdaArns)
    }

    /**
     * setupConversation
     *
     * Starts a conversation with the backend and uploads the repo for the LLMs to be able to use it.
     */
    public async setupConversation() {
        const conversationId = await this.lambdaClient.startConversation()

        const repoRootPath = await getSourceCodePath(this.config.workspaceRoot, 'src')
        const { zipFileBuffer, zipFileChecksum } = await prepareRepoData(repoRootPath)

        const uploadUrl = await this.lambdaClient.generatePresignedUrl(conversationId, zipFileChecksum)

        await uploadCode(uploadUrl, zipFileBuffer, zipFileChecksum)
    }

    private getSessionStateConfig(): Omit<SessionStateConfig, 'conversationId'> {
        return {
            client: this.config.client,
            llmConfig: this.config.llmConfig,
            workspaceRoot: this.config.workspaceRoot,
            backendConfig: this.config.backendConfig,
        }
    }

    /**
     * Triggered by the Write Code follow up button to start the code generation phase
     */
    async startCodegen(): Promise<void> {
        if (!this.state.conversationId) {
            throw new ConversationIdNotFoundError()
        }

        this._state = new CodeGenState(
            {
                ...this.getSessionStateConfig(),
                conversationId: this.state.conversationId,
            },
            this.approach,
            this.tabID
        )
        await this.nextInteraction(undefined)
    }

    async send(msg: string): Promise<Interaction> {
        const sessionStageConfig = this.getSessionStateConfig()

        if (msg === 'CLEAR') {
            this.task = ''
            this.approach = ''
            this._state = new RefinementState(sessionStageConfig, this.approach, this.tabID)
            const message =
                'Finished the session for you. Feel free to restart the session by typing the task you want to achieve.'
            return {
                content: [message],
            }
        }

        // When the task/"thing to do" hasn't been set yet, we want it to be the incoming message
        if (this.task === '') {
            this.task = msg
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

        return resp.interactions
    }

    public async acceptChanges() {
        for (const filePath of this._state.filePaths ?? []) {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(this.config.workspaceRoot, filePath)

            const uri = vscode.Uri.from({ scheme: weaverbirdScheme, path: filePath })
            const content = await this.config.fs.readFile(uri)
            const decodedContent = new TextDecoder().decode(content)

            await fs.mkdir(path.dirname(absolutePath))
            await fs.writeFile(absolutePath, decodedContent)
        }
    }

    get state() {
        return this._state
    }
}
