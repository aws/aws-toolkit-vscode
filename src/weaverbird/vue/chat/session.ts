/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { getLogger } from '../../../shared/logger/logger'
import { defaultLlmConfig } from '../../constants'
import { DefaultLambdaClient, LambdaClient } from '../../../shared/clients/lambdaClient'
import { collectFiles } from '../../files'
import { RefinementState } from './sessionState'
import { VirtualFileSystem } from '../../../shared/virtualFilesystem'
import type { Interaction, SessionState, SessionStateConfig, LocalResolvedConfig, LLMConfig } from '../../types'
import { AddToChat } from '../../models'

export class Session {
    public workspaceRoot: string
    private state: SessionState
    private task: string = ''
    private approach: string = ''
    private llmConfig = defaultLlmConfig
    private lambdaClient: LambdaClient
    private backendConfig: LocalResolvedConfig
    private fs: VirtualFileSystem

    private addToChat: AddToChat

    constructor(
        workspaceRoot: string,
        backendConfig: LocalResolvedConfig,
        fs: VirtualFileSystem,
        addToChat: AddToChat
    ) {
        this.workspaceRoot = workspaceRoot
        this.lambdaClient = new DefaultLambdaClient(backendConfig.region)
        this.backendConfig = backendConfig
        this.fs = fs
        this.state = new RefinementState(this.getSessionStateConfig(), '')

        this.addToChat = addToChat
    }

    async send(msg: string): Promise<Interaction[]> {
        try {
            getLogger().info(`Received message from chat view: ${msg}`)
            return await this.sendUnsafe(msg)
        } catch (e: any) {
            getLogger().error(e)
            return [
                {
                    origin: 'ai',
                    type: 'message',
                    content: `Received error: ${e.code} and status code: ${e.statusCode} [${e.message}] when trying to send the request to the Weaverbird API`,
                },
            ]
        }
    }

    public setLLMConfig(config: LLMConfig) {
        this.llmConfig = config
    }

    private getSessionStateConfig(): Omit<SessionStateConfig, 'conversationId'> {
        return {
            client: this.lambdaClient,
            llmConfig: this.llmConfig,
            workspaceRoot: this.workspaceRoot,
            backendConfig: this.backendConfig,
        }
    }

    async sendUnsafe(msg: string): Promise<Interaction[]> {
        const sessionStageConfig = this.getSessionStateConfig()

        const files = await collectFiles(path.join(this.workspaceRoot, 'src'))

        if (msg === 'CLEAR') {
            this.task = ''
            this.approach = ''
            this.state = new RefinementState(sessionStageConfig, this.approach)
            const message =
                'Finished the session for you. Feel free to restart the session by typing the task you want to achieve.'
            return [
                {
                    origin: 'ai',
                    type: 'message',
                    content: message,
                },
            ]
        }

        // When the task/"thing to do" hasn't been set yet, we want it to be the incoming message
        if (this.task === '') {
            this.task = msg
        }

        const resp = await this.state.interact({
            files,
            task: this.task,
            msg,
            fs: this.fs,
            addToChat: this.addToChat,
        })

        if (resp.nextState) {
            // Approach may have been changed after the interaction
            const newApproach = this.state.approach

            // Cancel the request before moving to a new state
            this.state.tokenSource.cancel()

            // Move to the next state
            this.state = resp.nextState

            // If approach was changed then we need to set it in the next state and this state
            this.state.approach = newApproach
            this.approach = newApproach
        }

        return resp.interactions
    }
}
