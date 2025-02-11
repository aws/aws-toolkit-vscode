/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'

import { ConversationNotStartedState, FeatureDevPrepareCodeGenState } from './sessionState'
import {
    type DeletedFileInfo,
    type Interaction,
    type NewFileInfo,
    type SessionState,
    type SessionStateConfig,
    UpdateFilesPathsParams,
} from '../../amazonq/commons/types'
import { ConversationIdNotFoundError } from '../errors'
import { featureDevChat, referenceLogText, featureDevScheme } from '../constants'
import fs from '../../shared/fs/fs'
import { FeatureDevClient } from '../client/featureDev'
import { codeGenRetryLimit } from '../limits'
import { telemetry } from '../../shared/telemetry/telemetry'
import { TelemetryHelper } from '../../amazonq/util/telemetryHelper'
import { ReferenceLogViewProvider } from '../../codewhisperer/service/referenceLogViewProvider'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { getLogger } from '../../shared/logger/logger'
import { logWithConversationId } from '../userFacingText'
import { CodeReference } from '../../amazonq/webview/ui/connector'
import { MynahIcons } from '@aws/mynah-ui'
import { i18n } from '../../shared/i18n-helper'
import { computeDiff } from '../../amazonq/commons/diff'
import { UpdateAnswerMessage } from '../../amazonq/commons/connector/connectorMessages'
import { FollowUpTypes } from '../../amazonq/commons/types'
import { SessionConfig } from '../../amazonq/commons/session/sessionConfigFactory'
import { Messenger } from '../../amazonq/commons/connector/baseMessenger'
export class Session {
    private _state?: SessionState | Omit<SessionState, 'uploadId'>
    private task: string = ''
    private proxyClient: FeatureDevClient
    private _conversationId?: string
    private codeGenRetries: number
    private preloaderFinished = false
    private _latestMessage: string = ''
    private _telemetry: TelemetryHelper
    private _codeResultMessageId: string | undefined = undefined
    private _acceptCodeMessageId: string | undefined = undefined
    private _acceptCodeTelemetrySent = false
    private _reportedCodeChanges: Set<string>

    // Used to keep track of whether or not the current session is currently authenticating/needs authenticating
    public isAuthenticating: boolean

    constructor(
        public readonly config: SessionConfig,
        private messenger: Messenger,
        public readonly tabID: string,
        initialState: Omit<SessionState, 'uploadId'> = new ConversationNotStartedState(tabID),
        proxyClient: FeatureDevClient = new FeatureDevClient()
    ) {
        this._state = initialState
        this.proxyClient = proxyClient

        this.codeGenRetries = codeGenRetryLimit

        this._telemetry = new TelemetryHelper()
        this.isAuthenticating = false
        this._reportedCodeChanges = new Set()
    }

    /**
     * Preload any events that have to run before a chat message can be sent
     */
    async preloader() {
        if (!this.preloaderFinished) {
            await this.setupConversation()
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
    private async setupConversation() {
        await telemetry.amazonq_startConversationInvoke.run(async (span) => {
            this._conversationId = await this.proxyClient.createConversation()
            getLogger().info(logWithConversationId(this.conversationId))

            span.record({ amazonqConversationId: this._conversationId, credentialStartUrl: AuthUtil.instance.startUrl })
        })

        this._state = new FeatureDevPrepareCodeGenState(
            {
                ...this.getSessionStateConfig(),
                conversationId: this.conversationId,
                uploadId: '',
                currentCodeGenerationId: undefined,
            },
            [],
            [],
            [],
            this.tabID,
            0
        )
    }

    updateWorkspaceRoot(workspaceRootFolder: string) {
        this.config.workspaceRoots = [workspaceRootFolder]
        this._state && this._state.updateWorkspaceRoot && this._state.updateWorkspaceRoot(workspaceRootFolder)
    }

    getWorkspaceRoot(): string {
        return this.config.workspaceRoots[0]
    }

    private getSessionStateConfig(): Omit<SessionStateConfig, 'uploadId'> {
        return {
            workspaceRoots: this.config.workspaceRoots,
            workspaceFolders: this.config.workspaceFolders,
            proxyClient: this.proxyClient,
            conversationId: this.conversationId,
        }
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
            tokenSource: this.state.tokenSource,
            uploadHistory: this.state.uploadHistory,
        })

        if (resp.nextState) {
            if (!this.state?.tokenSource?.token.isCancellationRequested) {
                this.state?.tokenSource?.cancel()
            }
            // Move to the next state
            this._state = resp.nextState
        }

        return resp.interaction
    }

    public async updateFilesPaths(params: UpdateFilesPathsParams) {
        const { tabID, filePaths, deletedFiles, messageId, disableFileActions = false } = params
        this.messenger.updateFileComponent(tabID, filePaths, deletedFiles, messageId, disableFileActions)
        await this.updateChatAnswer(tabID, this.getInsertCodePillText([...filePaths, ...deletedFiles]))
    }

    public async updateChatAnswer(tabID: string, insertCodePillText: string) {
        if (this._acceptCodeMessageId) {
            const answer = new UpdateAnswerMessage(
                {
                    messageId: this._acceptCodeMessageId,
                    messageType: 'system-prompt',
                    followUps: [
                        {
                            pillText: insertCodePillText,
                            type: FollowUpTypes.InsertCode,
                            icon: 'ok' as MynahIcons,
                            status: 'success',
                        },
                        {
                            pillText: i18n('AWS.amazonq.featureDev.pillText.provideFeedback'),
                            type: FollowUpTypes.ProvideFeedbackAndRegenerateCode,
                            icon: 'refresh' as MynahIcons,
                            status: 'info',
                        },
                    ],
                },
                tabID,
                featureDevChat
            )
            this.messenger.updateChatAnswer(answer)
        }
    }

    public async insertChanges() {
        const newFilePaths =
            this.state.filePaths?.filter((filePath) => !filePath.rejected && !filePath.changeApplied) ?? []
        await this.insertNewFiles(newFilePaths)

        const deletedFiles =
            this.state.deletedFiles?.filter((deletedFile) => !deletedFile.rejected && !deletedFile.changeApplied) ?? []
        await this.applyDeleteFiles(deletedFiles)

        await this.insertCodeReferenceLogs(this.state.references ?? [])

        if (this._codeResultMessageId) {
            await this.updateFilesPaths({
                tabID: this.state.tabID,
                filePaths: this.state.filePaths ?? [],
                deletedFiles: this.state.deletedFiles ?? [],
                messageId: this._codeResultMessageId,
            })
        }
    }

    public async insertNewFiles(newFilePaths: NewFileInfo[]) {
        await this.sendLinesOfCodeAcceptedTelemetry(newFilePaths)
        for (const filePath of newFilePaths) {
            const absolutePath = path.join(filePath.workspaceFolder.uri.fsPath, filePath.relativePath)

            const uri = filePath.virtualMemoryUri
            const content = await this.config.fs.readFile(uri)
            const decodedContent = new TextDecoder().decode(content)

            await fs.mkdir(path.dirname(absolutePath))
            await fs.writeFile(absolutePath, decodedContent)
            filePath.changeApplied = true
        }
    }

    public async applyDeleteFiles(deletedFiles: DeletedFileInfo[]) {
        for (const filePath of deletedFiles) {
            const absolutePath = path.join(filePath.workspaceFolder.uri.fsPath, filePath.relativePath)
            await fs.delete(absolutePath)
            filePath.changeApplied = true
        }
    }

    public async insertCodeReferenceLogs(codeReferences: CodeReference[]) {
        for (const ref of codeReferences) {
            ReferenceLogViewProvider.instance.addReferenceLog(referenceLogText(ref))
        }
    }

    public async disableFileList() {
        if (this._codeResultMessageId === undefined) {
            return
        }

        await this.updateFilesPaths({
            tabID: this.state.tabID,
            filePaths: this.state.filePaths ?? [],
            deletedFiles: this.state.deletedFiles ?? [],
            messageId: this._codeResultMessageId,
            disableFileActions: true,
        })
        this._codeResultMessageId = undefined
    }

    public updateCodeResultMessageId(messageId?: string) {
        this._codeResultMessageId = messageId
    }

    public updateAcceptCodeMessageId(messageId?: string) {
        this._acceptCodeMessageId = messageId
    }

    public updateAcceptCodeTelemetrySent(sent: boolean) {
        this._acceptCodeTelemetrySent = sent
    }

    public getInsertCodePillText(files: Array<NewFileInfo | DeletedFileInfo>) {
        if (files.every((file) => file.rejected || file.changeApplied)) {
            return i18n('AWS.amazonq.featureDev.pillText.continue')
        }
        if (files.some((file) => file.rejected || file.changeApplied)) {
            return i18n('AWS.amazonq.featureDev.pillText.acceptRemainingChanges')
        }
        return i18n('AWS.amazonq.featureDev.pillText.acceptAllChanges')
    }

    public async computeFilePathDiff(filePath: NewFileInfo) {
        const leftPath = `${filePath.workspaceFolder.uri.fsPath}/${filePath.relativePath}`
        const rightPath = filePath.virtualMemoryUri.path
        const diff = await computeDiff(leftPath, rightPath, this.tabID, featureDevScheme)
        return { leftPath, rightPath, ...diff }
    }

    public async sendMetricDataTelemetry(operationName: string, result: string) {
        await this.proxyClient.sendMetricData({
            metricName: 'Operation',
            metricValue: 1,
            timestamp: new Date(),
            product: 'FeatureDev',
            dimensions: [
                {
                    name: 'operationName',
                    value: operationName,
                },
                {
                    name: 'result',
                    value: result,
                },
            ],
        })
    }

    public async sendLinesOfCodeGeneratedTelemetry() {
        let charactersOfCodeGenerated = 0
        let linesOfCodeGenerated = 0
        // deleteFiles are currently not counted because the number of lines added is always 0
        const filePaths = this.state.filePaths ?? []
        for (const filePath of filePaths) {
            const { leftPath, changes, charsAdded, linesAdded } = await this.computeFilePathDiff(filePath)
            const codeChangeKey = `${leftPath}#@${JSON.stringify(changes)}`
            if (this._reportedCodeChanges.has(codeChangeKey)) {
                continue
            }
            charactersOfCodeGenerated += charsAdded
            linesOfCodeGenerated += linesAdded
            this._reportedCodeChanges.add(codeChangeKey)
        }
        await this.proxyClient.sendFeatureDevCodeGenerationEvent({
            conversationId: this.conversationId,
            charactersOfCodeGenerated,
            linesOfCodeGenerated,
        })
    }

    public async sendLinesOfCodeAcceptedTelemetry(filePaths: NewFileInfo[]) {
        let charactersOfCodeAccepted = 0
        let linesOfCodeAccepted = 0
        for (const filePath of filePaths) {
            const { charsAdded, linesAdded } = await this.computeFilePathDiff(filePath)
            charactersOfCodeAccepted += charsAdded
            linesOfCodeAccepted += linesAdded
        }
        await this.proxyClient.sendFeatureDevCodeAcceptanceEvent({
            conversationId: this.conversationId,
            charactersOfCodeAccepted,
            linesOfCodeAccepted,
        })
    }

    get state() {
        if (!this._state) {
            throw new Error("State should be initialized before it's read")
        }
        return this._state
    }

    get currentCodeGenerationId() {
        return this.state.currentCodeGenerationId
    }

    get uploadId() {
        if (!('uploadId' in this.state)) {
            throw new Error("UploadId has to be initialized before it's read")
        }
        return this.state.uploadId
    }

    get retries() {
        return this.codeGenRetries
    }

    decreaseRetries() {
        this.codeGenRetries -= 1
    }
    get conversationId() {
        if (!this._conversationId) {
            throw new ConversationIdNotFoundError()
        }
        return this._conversationId
    }

    // Used for cases where it is not needed to have conversationId
    get conversationIdUnsafe() {
        return this._conversationId
    }

    get latestMessage() {
        return this._latestMessage
    }

    set latestMessage(msg: string) {
        this._latestMessage = msg
    }

    get telemetry() {
        return this._telemetry
    }

    get acceptCodeMessageId() {
        return this._acceptCodeMessageId
    }

    get acceptCodeTelemetrySent() {
        return this._acceptCodeTelemetrySent
    }
}
