/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'

import { ConversationNotStartedState, PrepareCodeGenState, PrepareRefinementState } from './sessionState'
import {
    DevPhase,
    type DeletedFileInfo,
    type Interaction,
    type NewFileInfo,
    type SessionState,
    type SessionStateConfig,
} from '../types'
import { ConversationIdNotFoundError } from '../errors'
import { referenceLogText } from '../constants'
import fs from '../../shared/fs/fs'
import { Messenger } from '../controllers/chat/messenger/messenger'
import { FeatureDevClient } from '../client/featureDev'
import { approachRetryLimit, codeGenRetryLimit } from '../limits'
import { SessionConfig } from './sessionConfigFactory'
import { telemetry } from '../../shared/telemetry/telemetry'
import { TelemetryHelper } from '../util/telemetryHelper'
import { ReferenceLogViewProvider } from '../../codewhisperer/service/referenceLogViewProvider'
import { AuthUtil } from '../../codewhisperer/util/authUtil'

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

    /**
     * Creates a new Session instance.
     * @constructor
     * @param {SessionConfig} config - The configuration for the session.
     * @param {Messenger} messenger - The messenger used for communication.
     * @param {string} tabID - The ID of the tab associated with this session.
     * @param {Omit<SessionState, 'uploadId'>} initialState - The initial state of the session.
     * @param {FeatureDevClient} proxyClient - The client used for feature development.
     */
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
    /**
     * Preloads events that need to run before a chat message can be sent.
     * @param {string} msg - The message to be sent.
     * @returns {Promise<void>}
     * @throws {Error} If there's an issue during preloading.
     */
    async preloader(msg: string) {
        if (!this.preloaderFinished) {
            await this.setupConversation(msg)
            this.preloaderFinished = true
            this.messenger.sendAsyncEventProgress(this.tabID, true, undefined)
            await this.proxyClient.sendFeatureDevTelemetryEvent(this.conversationId) // send the event only once per conversation.
        }
    }

    /**
     * setupConversation
     *
     * Starts a conversation with the backend and uploads the repo for the LLMs to be able to use it.
     */
    /**
     * Sets up a conversation with the backend and uploads the repo for the LLMs to use.
     * @private
     * @param {string} msg - The initial message for the conversation.
     * @returns {Promise<void>}
     * @throws {Error} If there's an issue setting up the conversation.
     */
    private async setupConversation(msg: string) {
        // Store the initial message when setting up the conversation so that if it fails we can retry with this message
        this._latestMessage = msg

        await telemetry.amazonq_startConversationInvoke.run(async (span) => {
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

    /**
     * Updates the workspace root folder.
     * @param {string} workspaceRootFolder - The new workspace root folder path.
     */
    updateWorkspaceRoot(workspaceRootFolder: string) {
        this.config.workspaceRoots = [workspaceRootFolder]
        this._state && this._state.updateWorkspaceRoot && this._state.updateWorkspaceRoot(workspaceRootFolder)
    }

    /**
     * Retrieves the session state configuration.
     * @private
     * @returns {Omit<SessionStateConfig, 'uploadId'>} The session state configuration without the uploadId.
     */
    private getSessionStateConfig(): Omit<SessionStateConfig, 'uploadId'> {
        return {
            workspaceRoots: this.config.workspaceRoots,
            workspaceFolders: this.config.workspaceFolders,
            proxyClient: this.proxyClient,
            conversationId: this.conversationId,
        }
    }

    /**
     * Initializes the code generation phase.
     * Triggered by the Generate Code follow up button to move to the code generation phase.
     * @throws {Error} If there's an issue initializing the code generation phase.
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
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }

    /**
     * Sends a message and processes the next interaction.
     * @param {string} msg - The message to be sent.
     * @returns {Promise<Interaction>} The result of the next interaction.
     */
    async send(msg: string): Promise<Interaction> {
        // When the task/"thing to do" hasn't been set yet, we want it to be the incoming message
        if (this.task === '' && msg) {
            this.task = msg
        }

        this._latestMessage = msg

        return this.nextInteraction(msg)
    }

    /**
     * Processes the next interaction based on the current state.
     * @private
     * @param {string} msg - The message for the interaction.
     * @returns {Promise<Interaction>} The result of the interaction.
     */
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

    /**
     * Updates the file paths in the messenger.
     * @param {string} tabID - The ID of the tab.
     * @param {NewFileInfo[]} filePaths - Array of new file information.
     * @param {DeletedFileInfo[]} deletedFiles - Array of deleted file information.
     * @param {string} messageId - The ID of the message.
     * @returns {Promise<void>}
     */
    public async updateFilesPaths(
        tabID: string,
        filePaths: NewFileInfo[],
        deletedFiles: DeletedFileInfo[],
        messageId: string
    ) {
        this.messenger.updateFileComponent(tabID, filePaths, deletedFiles, messageId)
    }

    /**
     * Inserts changes into the file system and updates reference logs.
     * @returns {Promise<void>}
     * @throws {Error} If there's an issue writing files or deleting files.
     */
    public async insertChanges() {
        for (const filePath of this.state.filePaths?.filter((i) => !i.rejected) ?? []) {
            const absolutePath = path.join(filePath.workspaceFolder.uri.fsPath, filePath.relativePath)

            const uri = filePath.virtualMemoryUri
            const content = await this.config.fs.readFile(uri)
            const decodedContent = new TextDecoder().decode(content)

            await fs.mkdir(path.dirname(absolutePath))
            await fs.writeFile(absolutePath, decodedContent)
        }

        for (const filePath of this.state.deletedFiles?.filter((i) => !i.rejected) ?? []) {
            const absolutePath = path.join(filePath.workspaceFolder.uri.fsPath, filePath.relativePath)
            await fs.delete(absolutePath)
        }

        for (const ref of this.state.references ?? []) {
            ReferenceLogViewProvider.instance.addReferenceLog(referenceLogText(ref))
        }
    }

    /**
     * Gets the current state of the session.
     * @returns {SessionState | Omit<SessionState, 'uploadId'>} The current state of the session.
     * @throws {Error} If the state has not been initialized.
     */
    get state() {
        if (!this._state) {
            throw new Error("State should be initialized before it's read")
        }
        return this._state
    }

    /**
     * Gets the upload ID of the current session.
     * @returns {string} The upload ID.
     * @throws {Error} If the upload ID has not been initialized.
     */
    get uploadId() {
        if (!('uploadId' in this.state)) {
            throw new Error("UploadId has to be initialized before it's read")
        }
        return this.state.uploadId
    }

    /**
     * Gets the number of retries left based on the current development phase.
     * @returns {number} The number of retries left.
     */
    get retries() {
        switch (this.state.phase) {
            case DevPhase.APPROACH:
                return this.approachRetries
            case DevPhase.CODEGEN:
                return this.codeGenRetries
            default:
                return this.approachRetries
        }
    }

    /**
     * Decreases the number of retries based on the current development phase.
     */
    decreaseRetries() {
        switch (this.state.phase) {
            case DevPhase.APPROACH:
                this.approachRetries -= 1
                break
            case DevPhase.CODEGEN:
                this.codeGenRetries -= 1
                break
        }
    }
    /**
     * Gets the conversation ID of the current session.
     * @returns {string} The conversation ID.
     * @throws {ConversationIdNotFoundError} If the conversation ID is not set.
     */
    get conversationId() {
        if (!this._conversationId) {
            throw new ConversationIdNotFoundError()
        }
        return this._conversationId
    }

    /**
     * Gets the conversation ID of the current session without throwing an error if it's not set.
     * Used for cases where it is not needed to have conversationId.
     * @returns {string | undefined} The conversation ID, or undefined if not set.
     */
    get conversationIdUnsafe() {
        return this._conversationId
    }

    /**
     * Gets the latest message sent in the session.
     * @returns {string} The latest message.
     */
    get latestMessage() {
        return this._latestMessage
    }

    /**
     * Gets the telemetry helper for the session.
     * @returns {TelemetryHelper} The telemetry helper.
     */
    get telemetry() {
        return this._telemetry
    }
}
