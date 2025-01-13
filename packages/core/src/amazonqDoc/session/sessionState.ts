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
import { DocGenerationStep, docScheme, getFileSummaryPercentage, Mode } from '../constants'

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
import {
    EmptyCodeGenID,
    Intent,
    TelemetryHelper,
    getDeletedFileInfos,
    prepareRepoData,
    registerNewFiles,
} from '../../amazonqFeatureDev'
import { uploadCode } from '../../amazonqFeatureDev/util/upload'
import {
    ContentLengthError,
    DocServiceError,
    NoChangeRequiredException,
    PromptRefusalException,
    PromptTooVagueError,
    PromptUnrelatedError,
    ReadmeTooLargeError,
    ReadmeUpdateTooLargeError,
    WorkspaceEmptyError,
} from '../errors'
import { DocMessenger } from '../messenger'

abstract class CodeGenBase {
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

    async generateCode({
        messenger,
        fs,
        codeGenerationId,
        telemetry: telemetry,
        workspaceFolders,
        mode,
    }: {
        messenger: DocMessenger
        fs: VirtualFileSystem
        codeGenerationId: string
        telemetry: TelemetryHelper
        workspaceFolders: CurrentWsFolders
        mode: Mode
    }): Promise<{
        newFiles: NewFileInfo[]
        deletedFiles: DeletedFileInfo[]
        references: CodeReference[]
        codeGenerationRemainingIterationCount?: number
        codeGenerationTotalIterationCount?: number
    }> {
        for (
            let pollingIteration = 0;
            pollingIteration < this.pollCount && !this.isCancellationRequested;
            ++pollingIteration
        ) {
            const codegenResult = await this.config.proxyClient.getCodeGeneration(this.conversationId, codeGenerationId)
            const codeGenerationRemainingIterationCount = codegenResult.codeGenerationRemainingIterationCount
            const codeGenerationTotalIterationCount = codegenResult.codeGenerationTotalIterationCount

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
                        docScheme
                    )
                    telemetry.setNumberOfFilesGenerated(newFileInfo.length)
                    messenger.sendDocProgress(this.tabID, DocGenerationStep.GENERATING_ARTIFACTS + 1, 100, mode)

                    return {
                        newFiles: newFileInfo,
                        deletedFiles: getDeletedFileInfos(deletedFiles, workspaceFolders),
                        references,
                        codeGenerationRemainingIterationCount: codeGenerationRemainingIterationCount,
                        codeGenerationTotalIterationCount: codeGenerationTotalIterationCount,
                    }
                }
                case CodeGenerationStatus.PREDICT_READY:
                case CodeGenerationStatus.IN_PROGRESS: {
                    if (codegenResult.codeGenerationStatusDetail) {
                        const progress = getFileSummaryPercentage(codegenResult.codeGenerationStatusDetail)
                        messenger.sendDocProgress(
                            this.tabID,
                            progress === 100
                                ? DocGenerationStep.GENERATING_ARTIFACTS
                                : DocGenerationStep.SUMMARIZING_FILES,
                            progress,
                            mode
                        )
                    }
                    await new Promise((f) => globals.clock.setTimeout(f, this.requestDelay))
                    break
                }
                case CodeGenerationStatus.PREDICT_FAILED:
                case CodeGenerationStatus.DEBATE_FAILED:
                case CodeGenerationStatus.FAILED: {
                    // eslint-disable-next-line unicorn/no-null
                    messenger.sendUpdatePromptProgress(this.tabID, null)
                    switch (true) {
                        case codegenResult.codeGenerationStatusDetail?.includes('README_TOO_LARGE'): {
                            throw new ReadmeTooLargeError()
                        }
                        case codegenResult.codeGenerationStatusDetail?.includes('README_UPDATE_TOO_LARGE'): {
                            throw new ReadmeUpdateTooLargeError()
                        }
                        case codegenResult.codeGenerationStatusDetail?.includes('WORKSPACE_TOO_LARGE'): {
                            throw new ContentLengthError()
                        }
                        case codegenResult.codeGenerationStatusDetail?.includes('WORKSPACE_EMPTY'): {
                            throw new WorkspaceEmptyError()
                        }
                        case codegenResult.codeGenerationStatusDetail?.includes('PROMPT_UNRELATED'): {
                            throw new PromptUnrelatedError()
                        }
                        case codegenResult.codeGenerationStatusDetail?.includes('PROMPT_TOO_VAGUE'): {
                            throw new PromptTooVagueError()
                        }
                        case codegenResult.codeGenerationStatusDetail?.includes('PROMPT_REFUSAL'): {
                            throw new PromptRefusalException()
                        }
                        case codegenResult.codeGenerationStatusDetail?.includes('Guardrails'): {
                            throw new DocServiceError(
                                i18n('AWS.amazonq.doc.error.docGen.default'),
                                'GuardrailsException'
                            )
                        }
                        case codegenResult.codeGenerationStatusDetail?.includes('EmptyPatch'): {
                            if (codegenResult.codeGenerationStatusDetail?.includes('NO_CHANGE_REQUIRED')) {
                                throw new NoChangeRequiredException()
                            }
                            throw new DocServiceError(
                                i18n('AWS.amazonq.doc.error.docGen.default'),
                                'EmptyPatchException'
                            )
                        }
                        case codegenResult.codeGenerationStatusDetail?.includes('Throttling'): {
                            throw new DocServiceError(
                                i18n('AWS.amazonq.featureDev.error.throttling'),
                                'ThrottlingException'
                            )
                        }
                        default: {
                            throw new ToolkitError(i18n('AWS.amazonq.doc.error.docGen.default'), {
                                code: 'DocGenerationFailed',
                            })
                        }
                    }
                }
                default: {
                    const errorMessage = `Unknown status: ${codegenResult.codeGenerationStatus.status}\n`
                    throw new ToolkitError(errorMessage, { code: 'UnknownDocGenerationError' })
                }
            }
        }
        if (!this.isCancellationRequested) {
            // still in progress
            const errorMessage = i18n('AWS.amazonq.featureDev.error.codeGen.timeout')
            throw new ToolkitError(errorMessage, { code: 'DocGenerationTimeout' })
        }
        return {
            newFiles: [],
            deletedFiles: [],
            references: [],
        }
    }
}

export class CodeGenState extends CodeGenBase implements SessionState {
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
                if (!action.tokenSource?.token.isCancellationRequested) {
                    action.messenger.sendDocProgress(this.tabID, DocGenerationStep.SUMMARIZING_FILES, 0, action.mode)
                }
                await this.config.proxyClient.startCodeGeneration(
                    this.config.conversationId,
                    this.config.uploadId,
                    action.msg,
                    Intent.DOC,
                    codeGenerationId,
                    undefined,
                    action.folderPath ? { documentation: { type: 'README', scope: action.folderPath } } : undefined
                )

                const codeGeneration = await this.generateCode({
                    messenger: action.messenger,
                    fs: action.fs,
                    codeGenerationId,
                    telemetry: action.telemetry,
                    workspaceFolders: this.config.workspaceFolders,
                    mode: action.mode,
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
                const nextState = new PrepareCodeGenState(
                    this.config,
                    this.filePaths,
                    this.deletedFiles,
                    this.references,
                    this.tabID,
                    this.currentIteration + 1,
                    this.codeGenerationRemainingIterationCount,
                    this.codeGenerationTotalIterationCount,
                    action.uploadHistory,
                    this.tokenSource,
                    this.currentCodeGenerationId,
                    codeGenerationId
                )
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
}

export class PrepareCodeGenState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = DevPhase.CODEGEN
    public uploadId: string
    public conversationId: string
    constructor(
        private config: SessionStateConfig,
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
        const nextState = new CodeGenState(
            { ...this.config, uploadId },
            this.filePaths,
            this.deletedFiles,
            this.references,
            this.tabID,
            this.currentIteration,
            this.uploadHistory
        )
        return nextState.interact(action)
    }
}
