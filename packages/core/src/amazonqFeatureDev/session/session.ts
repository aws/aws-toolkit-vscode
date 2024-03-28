/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'

import { ConversationNotStartedState, PrepareCodeGenState, PrepareRefinementState } from './sessionState'
import type { DeletedFileInfo, Interaction, NewFileInfo, SessionState, SessionStateConfig } from '../types'
import { ConversationIdNotFoundError } from '../errors'
import { referenceLogText } from '../constants'
import { FileSystemCommon } from '../../srcShared/fs'
import { Messenger } from '../controllers/chat/messenger/messenger'
import { FeatureDevClient } from '../client/featureDev'
import { approachRetryLimit, codeGenRetryLimit } from '../limits'
import { SessionConfig } from './sessionConfigFactory'
import { telemetry } from '../../shared/telemetry/telemetry'
import { TelemetryHelper } from '../util/telemetryHelper'
import { ReferenceLogViewProvider } from '../../codewhisperer/service/referenceLogViewProvider'
import { AuthUtil } from '../../codewhisperer/util/authUtil'

const fs = FileSystemCommon.instance

export class Session {
    private _state?: SessionState | Omit<SessionState, 'uploadId'>
    private task: string = ''
    private approach: string = ''
    private proxyClient: FeatureDevClient
    private _conversationId?: string
    private approachRetries: number
    private codeGenRetries: number
    private preloaderFinished = false
    private _latestMessage: string = ''
    private _telemetry: TelemetryHelper

    // Used to keep track of whether or not the current session is currently authenticating/needs authenticating
    public isAuthenticating: boolean

    constructor(
        public readonly config: SessionConfig,
        private messenger: Messenger,
        public readonly tabID: string,
        initialState: Omit<SessionState, 'uploadId'> = new ConversationNotStartedState('', tabID),
        proxyClient: FeatureDevClient = new FeatureDevClient()
    ) {
        this._state = initialState
        this.proxyClient = proxyClient

        this.approachRetries = approachRetryLimit
        this.codeGenRetries = codeGenRetryLimit

        this._telemetry = new TelemetryHelper()
        this.isAuthenticating = false
    }

    /**
     * Preload any events that have to run before a chat message can be sent
     */
    async preloader(msg: string) {
        if (!this.preloaderFinished) {
            await this.setupConversation(msg)
            this.preloaderFinished = true
            this.messenger.sendAsyncEventProgress(this.tabID, true, undefined)
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

        await telemetry.amazonq_startConversationInvoke.run(async span => {
            this._conversationId = await this.proxyClient.createConversation()
            span.record({ amazonqConversationId: this._conversationId, credentialStartUrl: AuthUtil.instance.startUrl })
        })

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
            workspaceRoots: this.config.workspaceRoots,
            workspaceFolders: this.config.workspaceFolders,
            proxyClient: this.proxyClient,
            conversationId: this.conversationId,
        }
    }

    /**
     * Triggered by the Generate Code follow up button to move to the code generation phase
     */
    initCodegen(): void {
        this._state = new PrepareCodeGenState(
            {
                ...this.getSessionStateConfig(),
                conversationId: this.conversationId,
                uploadId: this.uploadId,
            },
            this.approach,
            [],
            [],
            [],
            this.tabID,
            0
        )
        this._latestMessage = ''

        telemetry.amazonq_isApproachAccepted.emit({
            amazonqConversationId: this.conversationId,
            enabled: true,
            result: 'Succeeded',
        })
    }

    async send(msg: string): Promise<Interaction> {
        // When the task/"thing to do" hasn't been set yet, we want it to be the incoming message
        if (this.task === '' && msg) {
            this.task = msg
        }

        this._latestMessage = msg

        return this.nextInteraction(msg)
    }

    private async nextInteraction(msg: string) {
        const resp = await this.state.interact({
            task: this.task,
            msg,
            fs: this.config.fs,
            messenger: this.messenger,
            telemetry: this.telemetry,
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

    public async updateFilesPaths(tabID: string, filePaths: NewFileInfo[], deletedFiles: DeletedFileInfo[]) {
        this.messenger.updateFileComponent(tabID, filePaths, deletedFiles)
    }

    public async insertChanges() {
        for (const filePath of this.state.filePaths?.filter(i => !i.rejected) ?? []) {
            const absolutePath = path.join(filePath.workspaceFolder.uri.fsPath, filePath.relativePath)

            const uri = filePath.virtualMemoryUri
            const content = await this.config.fs.readFile(uri)
            const decodedContent = new TextDecoder().decode(content)

            await fs.mkdir(path.dirname(absolutePath))
            await fs.writeFile(absolutePath, decodedContent)
        }

        for (const filePath of this.state.deletedFiles?.filter(i => !i.rejected) ?? []) {
            const absolutePath = path.join(filePath.workspaceFolder.uri.fsPath, filePath.relativePath)
            await fs.delete(absolutePath)
        }

        for (const ref of this.state.references ?? []) {
            ReferenceLogViewProvider.instance.addReferenceLog(referenceLogText(ref))
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

    get telemetry() {
        return this._telemetry
    }
}
