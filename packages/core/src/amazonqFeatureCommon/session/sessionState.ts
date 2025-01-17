/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { CodeReference, UploadHistory } from '../../amazonq/webview/ui/connector'
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
} from '../types'
import { prepareRepoData, getDeletedFileInfos, registerNewFiles } from '../util/files'
import { uploadCode } from '../util/upload'

export const EmptyCodeGenID = 'EMPTY_CURRENT_CODE_GENERATION_ID'

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

    protected abstract handleProgress(messenger: BaseMessenger, detail?: string): void
    protected abstract getScheme(): string
    protected abstract handleGenerationComplete(messenger: BaseMessenger, newFileInfo: NewFileInfo[]): void

    async generateCode({
        messenger,
        fs,
        codeGenerationId,
        telemetry: telemetry,
        workspaceFolders,
    }: {
        messenger: BaseMessenger
        fs: VirtualFileSystem
        codeGenerationId: string
        telemetry: any
        workspaceFolders: CurrentWsFolders
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
                    const newFileInfo = registerNewFiles(
                        fs,
                        newFileContents,
                        this.uploadId,
                        workspaceFolders,
                        this.conversationId,
                        this.getScheme()
                    )
                    telemetry.setNumberOfFilesGenerated(newFileInfo.length)

                    this.handleGenerationComplete(messenger, newFileInfo)

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
                        this.handleProgress(messenger, codegenResult.codeGenerationStatusDetail)
                    }
                    await new Promise((f) => globals.clock.setTimeout(f, this.requestDelay))
                    break
                }
                case CodeGenerationStatus.PREDICT_FAILED:
                case CodeGenerationStatus.DEBATE_FAILED:
                case CodeGenerationStatus.FAILED: {
                    throw this.handleError(messenger, codegenResult.codeGenerationStatusDetail)
                }
                default: {
                    const errorMessage = `Unknown status: ${codegenResult.codeGenerationStatus.status}\n`
                    throw new ToolkitError(errorMessage, { code: 'UnknownCodeGenError' })
                }
            }
        }

        if (!this.isCancellationRequested) {
            const errorMessage = i18n('AWS.amazonq.featureDev.error.codeGen.timeout')
            throw new ToolkitError(errorMessage, { code: 'CodeGenTimeout' })
        }

        return {
            newFiles: [],
            deletedFiles: [],
            references: [],
            codeGenerationRemainingIterationCount: codeGenerationRemainingIterationCount,
            codeGenerationTotalIterationCount: codeGenerationTotalIterationCount,
        }
    }

    protected abstract handleError(messenger: BaseMessenger, detail?: string): Error
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

    protected abstract createNextState(config: SessionStateConfig): SessionState

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        const uploadId = await telemetry.amazonq_createUpload.run(async (span) => {
            span.record({
                amazonqConversationId: this.config.conversationId,
                credentialStartUrl: AuthUtil.instance.startUrl,
            })
            const { zipFileBuffer, zipFileChecksum } = await prepareRepoData(
                this.config.workspaceRoots,
                this.config.workspaceFolders,
                action.telemetry,
                span
            )
            const uploadId = randomUUID()
            const { uploadUrl, kmsKeyArn } = await this.config.proxyClient.createUploadUrl(
                this.config.conversationId,
                zipFileChecksum,
                zipFileBuffer.length,
                uploadId
            )

            await uploadCode(uploadUrl, zipFileBuffer, zipFileChecksum, kmsKeyArn)

            return uploadId
        })

        this.uploadId = uploadId
        const nextState = this.createNextState({ ...this.config, uploadId })
        return nextState.interact(action)
    }
}

export interface CodeGenerationParams {
    messenger: BaseMessenger
    fs: VirtualFileSystem
    codeGenerationId: string
    telemetry: any
    workspaceFolders: CurrentWsFolders
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

    protected abstract createNextState(
        config: SessionStateConfig,
        params: {
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
    ): SessionState

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
