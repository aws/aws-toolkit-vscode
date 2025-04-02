/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger/logger'
import { AmazonqCreateUpload, Span, telemetry } from '../../shared/telemetry/telemetry'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { CodeReference, UploadHistory } from '../webview/ui/connector'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { randomUUID } from '../../shared/crypto'
import { i18n } from '../../shared/i18n-helper'
import {
    CodeGenerationStatus,
    CurrentWsFolders,
    DeletedFileInfo,
    DevPhase,
    NewFileInfo,
    SessionState,
    SessionStateAction,
    SessionStateConfig,
    SessionStateInteraction,
    SessionStatePhase,
} from '../commons/types'
import { prepareRepoData, getDeletedFileInfos, registerNewFiles, PrepareRepoDataOptions } from '../util/files'
import { uploadCode } from '../util/upload'
import { truncate } from '../../shared/utilities/textUtilities'

export const EmptyCodeGenID = 'EMPTY_CURRENT_CODE_GENERATION_ID'
export const RunCommandLogFileName = '.amazonq/dev/run_command.log'

export interface BaseMessenger {
    sendAnswer(params: any): void
    sendUpdatePlaceholder?(tabId: string, message: string): void
}

export abstract class CodeGenBase {
    private pollCount = 360
    private requestDelay = 5000
    public tokenSource: vscode.CancellationTokenSource
    public phase: SessionStatePhase = DevPhase.CODEGEN
    public readonly conversationId: string
    public readonly uploadId: string
    public currentCodeGenerationId?: string
    public isCancellationRequested?: boolean

    constructor(
        protected config: SessionStateConfig,
        public tabID: string
    ) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.conversationId = config.conversationId
        this.uploadId = config.uploadId
        this.currentCodeGenerationId = config.currentCodeGenerationId || EmptyCodeGenID
    }

    protected abstract handleProgress(messenger: BaseMessenger, action: SessionStateAction, detail?: string): void
    protected abstract getScheme(): string
    protected abstract getTimeoutErrorCode(): string
    protected abstract handleGenerationComplete(
        messenger: BaseMessenger,
        newFileInfo: NewFileInfo[],
        action: SessionStateAction
    ): void

    async generateCode({
        messenger,
        fs,
        codeGenerationId,
        telemetry: telemetry,
        workspaceFolders,
        action,
    }: {
        messenger: BaseMessenger
        fs: VirtualFileSystem
        codeGenerationId: string
        telemetry: any
        workspaceFolders: CurrentWsFolders
        action: SessionStateAction
    }): Promise<{
        newFiles: NewFileInfo[]
        deletedFiles: DeletedFileInfo[]
        references: CodeReference[]
        codeGenerationRemainingIterationCount?: number
        codeGenerationTotalIterationCount?: number
    }> {
        let codeGenerationRemainingIterationCount = undefined
        let codeGenerationTotalIterationCount = undefined
        for (
            let pollingIteration = 0;
            pollingIteration < this.pollCount && !this.isCancellationRequested;
            ++pollingIteration
        ) {
            const codegenResult = await this.config.proxyClient.getCodeGeneration(this.conversationId, codeGenerationId)
            codeGenerationRemainingIterationCount = codegenResult.codeGenerationRemainingIterationCount
            codeGenerationTotalIterationCount = codegenResult.codeGenerationTotalIterationCount

            getLogger().debug(`Codegen response: %O`, codegenResult)
            telemetry.setCodeGenerationResult(codegenResult.codeGenerationStatus.status)

            switch (codegenResult.codeGenerationStatus.status as CodeGenerationStatus) {
                case CodeGenerationStatus.COMPLETE: {
                    const { newFileContents, deletedFiles, references } =
                        await this.config.proxyClient.exportResultArchive(this.conversationId)

                    const logFileInfo = newFileContents.find(
                        (file: { zipFilePath: string; fileContent: string }) =>
                            file.zipFilePath === RunCommandLogFileName
                    )
                    if (logFileInfo) {
                        logFileInfo.fileContent = truncate(logFileInfo.fileContent, 10000000, '\n... [truncated]') // Limit to max 20MB
                        getLogger().info(`sessionState: Run Command logs, ${logFileInfo.fileContent}`)
                        newFileContents.splice(newFileContents.indexOf(logFileInfo), 1)
                    }

                    const newFileInfo = registerNewFiles(
                        fs,
                        newFileContents,
                        this.uploadId,
                        workspaceFolders,
                        this.conversationId,
                        this.getScheme()
                    )
                    telemetry.setNumberOfFilesGenerated(newFileInfo.length)

                    this.handleGenerationComplete(messenger, newFileInfo, action)

                    return {
                        newFiles: newFileInfo,
                        deletedFiles: getDeletedFileInfos(deletedFiles, workspaceFolders),
                        references,
                        codeGenerationRemainingIterationCount,
                        codeGenerationTotalIterationCount,
                    }
                }
                case CodeGenerationStatus.PREDICT_READY:
                case CodeGenerationStatus.IN_PROGRESS: {
                    if (codegenResult.codeGenerationStatusDetail) {
                        this.handleProgress(messenger, action, codegenResult.codeGenerationStatusDetail)
                    }
                    await new Promise((f) => globals.clock.setTimeout(f, this.requestDelay))
                    break
                }
                case CodeGenerationStatus.PREDICT_FAILED:
                case CodeGenerationStatus.DEBATE_FAILED:
                case CodeGenerationStatus.FAILED: {
                    throw this.handleError(messenger, codegenResult)
                }
                default: {
                    const errorMessage = `Unknown status: ${codegenResult.codeGenerationStatus.status}\n`
                    throw new ToolkitError(errorMessage, { code: 'UnknownCodeGenError' })
                }
            }
        }

        if (!this.isCancellationRequested) {
            const errorMessage = i18n('AWS.amazonq.featureDev.error.codeGen.timeout')
            throw new ToolkitError(errorMessage, { code: this.getTimeoutErrorCode() })
        }

        return {
            newFiles: [],
            deletedFiles: [],
            references: [],
            codeGenerationRemainingIterationCount: codeGenerationRemainingIterationCount,
            codeGenerationTotalIterationCount: codeGenerationTotalIterationCount,
        }
    }

    protected abstract handleError(messenger: BaseMessenger, codegenResult: any): Error
}

export abstract class BasePrepareCodeGenState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = DevPhase.CODEGEN
    public uploadId: string
    public conversationId: string

    constructor(
        protected config: SessionStateConfig,
        public filePaths: NewFileInfo[],
        public deletedFiles: DeletedFileInfo[],
        public references: CodeReference[],
        public tabID: string,
        public currentIteration: number,
        public codeGenerationRemainingIterationCount?: number,
        public codeGenerationTotalIterationCount?: number,
        public uploadHistory: UploadHistory = {},
        public superTokenSource: vscode.CancellationTokenSource = new vscode.CancellationTokenSource(),
        public currentCodeGenerationId?: string,
        public codeGenerationId?: string
    ) {
        this.tokenSource = superTokenSource || new vscode.CancellationTokenSource()
        this.uploadId = config.uploadId
        this.currentCodeGenerationId = currentCodeGenerationId
        this.conversationId = config.conversationId
        this.uploadHistory = uploadHistory
        this.codeGenerationId = codeGenerationId
    }

    updateWorkspaceRoot(workspaceRoot: string) {
        this.config.workspaceRoots = [workspaceRoot]
    }

    protected createNextState(
        config: SessionStateConfig,
        StateClass?: new (
            config: SessionStateConfig,
            filePaths: NewFileInfo[],
            deletedFiles: DeletedFileInfo[],
            references: CodeReference[],
            tabID: string,
            currentIteration: number,
            uploadHistory: UploadHistory,
            codeGenerationRemainingIterationCount?: number,
            codeGenerationTotalIterationCount?: number
        ) => SessionState
    ): SessionState {
        return new StateClass!(
            config,
            this.filePaths,
            this.deletedFiles,
            this.references,
            this.tabID,
            this.currentIteration,
            this.uploadHistory
        )
    }

    protected abstract preUpload(action: SessionStateAction): void
    protected abstract postUpload(action: SessionStateAction): void

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        this.preUpload(action)
        const uploadId = await telemetry.amazonq_createUpload.run(async (span) => {
            span.record({
                amazonqConversationId: this.config.conversationId,
                credentialStartUrl: AuthUtil.instance.startUrl,
            })
            const { zipFileBuffer, zipFileChecksum } = await this.prepareProjectZip(
                this.config.workspaceRoots,
                this.config.workspaceFolders,
                span,
                { telemetry: action.telemetry }
            )
            const uploadId = randomUUID()
            const { uploadUrl, kmsKeyArn } = await this.config.proxyClient.createUploadUrl(
                this.config.conversationId,
                zipFileChecksum,
                zipFileBuffer.length,
                uploadId
            )

            await uploadCode(uploadUrl, zipFileBuffer, zipFileChecksum, kmsKeyArn)
            this.postUpload(action)

            return uploadId
        })

        this.uploadId = uploadId
        const nextState = this.createNextState({ ...this.config, uploadId })
        return nextState.interact(action)
    }

    protected async prepareProjectZip(
        workspaceRoots: string[],
        workspaceFolders: CurrentWsFolders,
        span: Span<AmazonqCreateUpload>,
        options: PrepareRepoDataOptions
    ) {
        return await prepareRepoData(workspaceRoots, workspaceFolders, span, options)
    }
}

export interface CodeGenerationParams {
    messenger: BaseMessenger
    fs: VirtualFileSystem
    codeGenerationId: string
    telemetry: any
    workspaceFolders: CurrentWsFolders
}

export interface CreateNextStateParams {
    filePaths: NewFileInfo[]
    deletedFiles: DeletedFileInfo[]
    references: CodeReference[]
    currentIteration: number
    remainingIterations?: number
    totalIterations?: number
    uploadHistory: UploadHistory
    tokenSource: vscode.CancellationTokenSource
    currentCodeGenerationId?: string
    codeGenerationId?: string
}

export abstract class BaseCodeGenState extends CodeGenBase implements SessionState {
    constructor(
        config: SessionStateConfig,
        public filePaths: NewFileInfo[],
        public deletedFiles: DeletedFileInfo[],
        public references: CodeReference[],
        tabID: string,
        public currentIteration: number,
        public uploadHistory: UploadHistory,
        public codeGenerationRemainingIterationCount?: number,
        public codeGenerationTotalIterationCount?: number
    ) {
        super(config, tabID)
    }

    protected createNextState(
        config: SessionStateConfig,
        params: CreateNextStateParams,
        StateClass?: new (
            config: SessionStateConfig,
            filePaths: NewFileInfo[],
            deletedFiles: DeletedFileInfo[],
            references: CodeReference[],
            tabID: string,
            currentIteration: number,
            remainingIterations?: number,
            totalIterations?: number,
            uploadHistory?: UploadHistory,
            tokenSource?: vscode.CancellationTokenSource,
            currentCodeGenerationId?: string,
            codeGenerationId?: string
        ) => SessionState
    ): SessionState {
        return new StateClass!(
            config,
            params.filePaths,
            params.deletedFiles,
            params.references,
            this.tabID,
            params.currentIteration,
            params.remainingIterations,
            params.totalIterations,
            params.uploadHistory,
            params.tokenSource,
            params.currentCodeGenerationId,
            params.codeGenerationId
        )
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        return telemetry.amazonq_codeGenerationInvoke.run(async (span) => {
            try {
                action.tokenSource?.token.onCancellationRequested(() => {
                    this.isCancellationRequested = true
                    if (action.tokenSource) {
                        this.tokenSource = action.tokenSource
                    }
                })

                span.record({
                    amazonqConversationId: this.config.conversationId,
                    credentialStartUrl: AuthUtil.instance.startUrl,
                })

                action.telemetry.setGenerateCodeIteration(this.currentIteration)
                action.telemetry.setGenerateCodeLastInvocationTime()

                const codeGenerationId = randomUUID()
                await this.startCodeGeneration(action, codeGenerationId)

                const codeGeneration = await this.generateCode({
                    messenger: action.messenger,
                    fs: action.fs,
                    codeGenerationId,
                    telemetry: action.telemetry,
                    workspaceFolders: this.config.workspaceFolders,
                    action,
                })

                if (codeGeneration && !action.tokenSource?.token.isCancellationRequested) {
                    this.config.currentCodeGenerationId = codeGenerationId
                    this.currentCodeGenerationId = codeGenerationId
                }

                this.filePaths = codeGeneration.newFiles
                this.deletedFiles = codeGeneration.deletedFiles
                this.references = codeGeneration.references
                this.codeGenerationRemainingIterationCount = codeGeneration.codeGenerationRemainingIterationCount
                this.codeGenerationTotalIterationCount = codeGeneration.codeGenerationTotalIterationCount
                this.currentIteration =
                    this.codeGenerationRemainingIterationCount && this.codeGenerationTotalIterationCount
                        ? this.codeGenerationTotalIterationCount - this.codeGenerationRemainingIterationCount
                        : this.currentIteration + 1

                if (action.uploadHistory && !action.uploadHistory[codeGenerationId] && codeGenerationId) {
                    action.uploadHistory[codeGenerationId] = {
                        timestamp: Date.now(),
                        uploadId: this.config.uploadId,
                        filePaths: codeGeneration.newFiles,
                        deletedFiles: codeGeneration.deletedFiles,
                        tabId: this.tabID,
                    }
                }

                action.telemetry.setAmazonqNumberOfReferences(this.references.length)
                action.telemetry.recordUserCodeGenerationTelemetry(span, this.conversationId)

                const nextState = this.createNextState(this.config, {
                    filePaths: this.filePaths,
                    deletedFiles: this.deletedFiles,
                    references: this.references,
                    currentIteration: this.currentIteration,
                    remainingIterations: this.codeGenerationRemainingIterationCount,
                    totalIterations: this.codeGenerationTotalIterationCount,
                    uploadHistory: action.uploadHistory ? action.uploadHistory : {},
                    tokenSource: this.tokenSource,
                    currentCodeGenerationId: this.currentCodeGenerationId,
                    codeGenerationId,
                })

                return {
                    nextState,
                    interaction: {},
                }
            } catch (e) {
                throw e instanceof ToolkitError
                    ? e
                    : ToolkitError.chain(e, 'Server side error', { code: 'UnhandledCodeGenServerSideError' })
            }
        })
    }

    protected abstract startCodeGeneration(action: SessionStateAction, codeGenerationId: string): Promise<void>
}
