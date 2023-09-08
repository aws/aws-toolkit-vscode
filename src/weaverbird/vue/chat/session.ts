/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from '../../../shared/logger/logger'

import { LocalResolvedConfig } from '../../config'
import { defaultLlmConfig } from './constants'
import { LLMConfig } from './types'
import { DefaultLambdaClient, LambdaClient } from '../../../shared/clients/lambdaClient'
import { collectFiles } from '../../files'
import { SessionState, SessionStateConfig, RefinementState, Interaction } from './sessionState'

export class Session {
    // TODO remake private
    public onProgressEventEmitter: vscode.EventEmitter<string>
    public onProgressEvent: vscode.Event<string>

    public workspaceRoot: string
    private state: SessionState
    private task: string = ''
    private approach: string = ''
    private llmConfig = defaultLlmConfig
    private lambdaClient: LambdaClient
    private backendConfig: LocalResolvedConfig

    public onAddToHistory: vscode.EventEmitter<Interaction[]>

    // TODO remake private
    public onProgressFinishedEventEmitter: vscode.EventEmitter<void>
    public onProgressFinishedEvent: vscode.Event<void>

    constructor(
        workspaceRoot: string,
        onAddToHistory: vscode.EventEmitter<Interaction[]>,
        backendConfig: LocalResolvedConfig
    ) {
        this.workspaceRoot = workspaceRoot
        this.onProgressEventEmitter = new vscode.EventEmitter<string>()
        this.lambdaClient = new DefaultLambdaClient(backendConfig.region)
        this.backendConfig = backendConfig
        this.state = new RefinementState(this.getSessionStateConfig(), '')
        this.onProgressEvent = this.onProgressEventEmitter.event

        this.onAddToHistory = onAddToHistory
        this.onProgressFinishedEventEmitter = new vscode.EventEmitter<void>()
        this.onProgressFinishedEvent = this.onProgressFinishedEventEmitter.event
    }

    async send(msg: string): Promise<Interaction | Interaction[]> {
        try {
            getLogger().info(`Received message from chat view: ${msg}`)
            return await this.sendUnsafe(msg)
        } catch (e: any) {
            getLogger().error(e)
            return {
                origin: 'ai',
                type: 'message',
                content: `Received error: ${e.code} and status code: ${e.statusCode} [${e.message}] when trying to send the request to the Weaverbird API`,
            }
        }
    }

    public setLLMConfig(config: LLMConfig) {
        this.llmConfig = config
    }

    private getSessionStateConfig(): SessionStateConfig {
        return {
            client: this.lambdaClient,
            llmConfig: this.llmConfig,
            workspaceRoot: this.workspaceRoot,
            backendConfig: this.backendConfig,
        }
    }

    async sendUnsafe(msg: string): Promise<Interaction | Interaction[]> {
        const sessionStageConfig = this.getSessionStateConfig()

        const files = await collectFiles(path.join(this.workspaceRoot, 'src'))

        if (msg === 'CLEAR') {
            this.task = ''
            this.approach = ''
            this.state = new RefinementState(sessionStageConfig, this.approach)
            const message =
                'Finished the session for you. Feel free to restart the session by typing the task you want to achieve.'
            return {
                origin: 'ai',
                type: 'message',
                content: message,
            }
        }

        // When the task/"thing to do" hasn't been set yet, we want it to be the incoming message
        if (this.task === '') {
            this.task = msg
        }

        const resp = await this.state.interact({
            files,
            task: this.task,
            msg,
            onAddToHistory: this.onAddToHistory,
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
