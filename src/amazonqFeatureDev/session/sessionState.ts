/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MynahIcons } from '@aws/mynah-ui'
import { randomUUID } from 'crypto'
import * as path from 'path'
import sanitizeHtml from 'sanitize-html'
import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { VirtualMemoryFile } from '../../shared/virtualMemoryFile'
import { FileSystemCommon } from '../../srcShared/fs'
import { featureDevScheme } from '../constants'
import { IllegalStateTransition, UserMessageNotFoundError } from '../errors'
import {
    FollowUpTypes,
    NewFileContents,
    SessionState,
    SessionStateAction,
    SessionStateConfig,
    SessionStateInteraction,
    SessionStatePhase,
} from '../types'
import { collectFiles, prepareRepoData } from '../util/files'
import { TelemetryHelper } from '../util/telemetryHelper'
import { uploadCode } from '../util/upload'
import { CodeReference } from '../../amazonq/webview/ui/connector'

const fs = FileSystemCommon.instance

export class ConversationNotStartedState implements Omit<SessionState, 'uploadId'> {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = 'Init'

    constructor(public approach: string, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.approach = ''
    }

    async interact(_action: SessionStateAction): Promise<SessionStateInteraction> {
        throw new IllegalStateTransition()
    }
}

export class PrepareRefinementState implements Omit<SessionState, 'uploadId'> {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = 'Approach'
    constructor(private config: Omit<SessionStateConfig, 'uploadId'>, public approach: string, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }
    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        const uploadId = await telemetry.amazonq_createUpload.run(async span => {
            span.record({ amazonqConversationId: this.config.conversationId })
            const { zipFileBuffer, zipFileChecksum } = await prepareRepoData(
                this.config.sourceRoot,
                action.telemetry,
                span
            )

            const { uploadUrl, uploadId, kmsKeyArn } = await this.config.proxyClient.createUploadUrl(
                this.config.conversationId,
                zipFileChecksum,
                zipFileBuffer.length
            )

            await uploadCode(uploadUrl, zipFileBuffer, zipFileChecksum, kmsKeyArn)
            return uploadId
        })

        const nextState = new RefinementState({ ...this.config, uploadId }, this.approach, this.tabID, 0)
        return nextState.interact(action)
    }
}

export class RefinementState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public readonly conversationId: string
    public readonly uploadId: string
    public readonly phase = 'Approach'

    constructor(
        private config: SessionStateConfig,
        public approach: string,
        public tabID: string,
        private currentIteration: number
    ) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.conversationId = config.conversationId
        this.uploadId = config.uploadId
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        return telemetry.amazonq_approachInvoke.run(async span => {
            if (action.msg && action.msg.indexOf('MOCK CODE') !== -1) {
                return new MockCodeGenState(this.config, this.approach, this.tabID).interact(action)
            }
            try {
                span.record({ amazonqConversationId: this.conversationId })
                action.telemetry.setGenerateApproachIteration(this.currentIteration)
                action.telemetry.setGenerateApproachLastInvocationTime()
                if (!action.msg) {
                    throw new UserMessageNotFoundError()
                }

                const approach = await this.config.proxyClient.generatePlan(
                    this.config.conversationId,
                    this.config.uploadId,
                    action.msg
                )

                this.approach = sanitizeHtml(
                    approach ??
                        'There has been a problem generating an approach. Please open a conversation in a new tab',
                    {}
                )
                getLogger().debug(`Approach response: %O`, this.approach)

                action.telemetry.recordUserApproachTelemetry(span, this.conversationId)
                return {
                    nextState: new RefinementState(
                        {
                            ...this.config,
                            conversationId: this.conversationId,
                        },
                        this.approach,
                        this.tabID,
                        this.currentIteration + 1
                    ),
                    interaction: {
                        content: `${this.approach}\n`,
                    },
                }
            } catch (e) {
                throw e instanceof ToolkitError
                    ? e
                    : ToolkitError.chain(e, 'Server side error', { code: 'UnhandledApproachServerSideError' })
            }
        })
    }
}

async function createFilePaths(
    fs: VirtualFileSystem,
    newFileContents: NewFileContents,
    uploadId: string
): Promise<string[]> {
    const filePaths: string[] = []
    for (const { filePath, fileContent } of newFileContents) {
        const encoder = new TextEncoder()
        const contents = encoder.encode(fileContent)
        const generationFilePath = path.join(uploadId, filePath)
        const uri = vscode.Uri.from({ scheme: featureDevScheme, path: generationFilePath })
        fs.registerProvider(uri, new VirtualMemoryFile(contents))
        filePaths.push(filePath)
    }

    return filePaths
}

abstract class CodeGenBase {
    private pollCount = 180
    private requestDelay = 10000
    readonly tokenSource: vscode.CancellationTokenSource
    public phase: SessionStatePhase = 'Codegen'
    public readonly conversationId: string
    public readonly uploadId: string

    constructor(protected config: SessionStateConfig, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.conversationId = config.conversationId
        this.uploadId = config.uploadId
    }

    async generateCode({
        fs,
        codeGenerationId,
        telemetry: telemetry,
    }: {
        fs: VirtualFileSystem
        codeGenerationId: string
        telemetry: TelemetryHelper
    }): Promise<{
        newFiles: any
        newFilePaths: string[]
        deletedFiles: string[]
        references: CodeReference[]
    }> {
        for (
            let pollingIteration = 0;
            pollingIteration < this.pollCount && !this.tokenSource.token.isCancellationRequested;
            ++pollingIteration
        ) {
            const codegenResult = await this.config.proxyClient.getCodeGeneration(this.conversationId, codeGenerationId)
            getLogger().debug(`Codegen response: %O`, codegenResult)
            telemetry.setCodeGenerationResult(codegenResult.codeGenerationStatus.status)
            switch (codegenResult.codeGenerationStatus.status) {
                case 'Complete': {
                    const { newFileContents, deletedFiles, references } =
                        await this.config.proxyClient.exportResultArchive(this.conversationId)
                    const newFilePaths = await createFilePaths(fs, newFileContents, this.uploadId)
                    telemetry.setNumberOfFilesGenerated(newFilePaths.length)
                    return {
                        newFiles: newFileContents,
                        newFilePaths,
                        deletedFiles,
                        references,
                    }
                }
                case 'predict-ready':
                case 'InProgress': {
                    await new Promise(f => globals.clock.setTimeout(f, this.requestDelay))
                    break
                }
                case 'predict-failed':
                case 'debate-failed':
                case 'Failed': {
                    throw new ToolkitError('Code generation failed', { code: 'CodeGenFailed' })
                }
                default: {
                    const errorMessage = `Unknown status: ${codegenResult.codeGenerationStatus.status}\n`
                    throw new ToolkitError(errorMessage, { code: 'UnknownCodeGenError' })
                }
            }
        }
        if (!this.tokenSource.token.isCancellationRequested) {
            // still in progress
            const errorMessage = 'Code generation did not finish withing the expected time'
            throw new ToolkitError(errorMessage, { code: 'CodeGenTimeout' })
        }
        return {
            newFiles: [],
            newFilePaths: [],
            deletedFiles: [],
            references: [],
        }
    }
}

export class CodeGenState extends CodeGenBase implements SessionState {
    constructor(
        config: SessionStateConfig,
        public approach: string,
        public filePaths: string[],
        public deletedFiles: string[],
        public references: CodeReference[],
        tabID: string,
        private currentIteration: number
    ) {
        super(config, tabID)
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        return telemetry.amazonq_codeGenerationInvoke.run(async span => {
            try {
                span.record({ amazonqConversationId: this.config.conversationId })
                action.telemetry.setGenerateCodeIteration(this.currentIteration)
                action.telemetry.setGenerateCodeLastInvocationTime()

                const { codeGenerationId } = await this.config.proxyClient.startCodeGeneration(
                    this.config.conversationId,
                    this.config.uploadId,
                    action.msg
                )

                action.messenger.sendAnswer({
                    message: 'Generating code ...',
                    type: 'answer-part',
                    tabID: this.tabID,
                })

                const codeGeneration = await this.generateCode({
                    fs: action.fs,
                    codeGenerationId,
                    telemetry: action.telemetry,
                })
                this.filePaths = codeGeneration.newFilePaths
                this.deletedFiles = codeGeneration.deletedFiles
                this.references = codeGeneration.references
                action.telemetry.setAmazonqNumberOfReferences(this.references.length)
                action.telemetry.recordUserCodeGenerationTelemetry(span, this.conversationId)
                const nextState = new PrepareCodeGenState(
                    this.config,
                    this.approach,
                    this.filePaths,
                    this.deletedFiles,
                    this.references,
                    this.tabID,
                    this.currentIteration + 1
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

export class MockCodeGenState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public filePaths: string[]
    public deletedFiles: string[]
    public readonly conversationId: string
    public readonly uploadId: string

    constructor(private config: SessionStateConfig, public approach: string, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.filePaths = []
        this.deletedFiles = []
        this.conversationId = config.conversationId
        this.uploadId = randomUUID()
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        let newFileContents: NewFileContents = []

        // in a `mockcodegen` state, we should read from the `mock-data` folder and output
        // every file retrieved in the same shape the LLM would
        const mockedFilesDir = path.join(this.config.workspaceRoot, './mock-data')
        try {
            const mockDirectoryExists = await fs.stat(mockedFilesDir)
            if (mockDirectoryExists) {
                const files = await collectFiles(mockedFilesDir, false)
                newFileContents = files.map(f => ({
                    filePath: f.filePath.replace('mock-data/', ''),
                    fileContent: f.fileContent,
                }))
                this.filePaths = await createFilePaths(action.fs, newFileContents, this.uploadId)
                this.deletedFiles = ['src/this-file-should-be-deleted.ts']
            }
            action.messenger.sendCodeResult(
                this.filePaths,
                this.deletedFiles,
                [
                    {
                        licenseName: 'MIT',
                        repository: 'foo',
                        url: 'foo',
                    },
                ],
                this.tabID,
                this.uploadId
            )
            action.messenger.sendAnswer({
                message: undefined,
                type: 'system-prompt',
                followUps: [
                    {
                        pillText: 'Accept changes',
                        type: FollowUpTypes.AcceptCode,
                        icon: 'ok' as MynahIcons,
                        status: 'success',
                    },
                    {
                        pillText: 'Provide feedback & regenerate',
                        type: FollowUpTypes.ProvideFeedbackAndRegenerateCode,
                        icon: 'refresh' as MynahIcons,
                        status: 'info',
                    },
                ],
                tabID: this.tabID,
            })
        } catch (e) {
            // TODO: handle this error properly, double check what would be expected behaviour if mock code does not work.
            getLogger().error('Unable to use mock code generation: %O', e)
        }

        return {
            // no point in iterating after a mocked code gen?
            nextState: this,
            interaction: {},
        }
    }
}

export class PrepareCodeGenState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = 'Codegen'
    public uploadId: string
    public conversationId: string
    constructor(
        private config: SessionStateConfig,
        public approach: string,
        public filePaths: string[],
        public deletedFiles: string[],
        public references: CodeReference[],
        public tabID: string,
        private currentIteration: number
    ) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.uploadId = config.uploadId
        this.conversationId = config.conversationId
    }
    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        const uploadId = await telemetry.amazonq_createUpload.run(async span => {
            action.messenger.sendAnswer({
                message: 'Uploading code ...',
                type: 'answer-part',
                tabID: this.tabID,
            })

            const { zipFileBuffer, zipFileChecksum } = await prepareRepoData(
                this.config.sourceRoot,
                action.telemetry,
                span
            )

            const { uploadUrl, uploadId, kmsKeyArn } = await this.config.proxyClient.createUploadUrl(
                this.config.conversationId,
                zipFileChecksum,
                zipFileBuffer.length
            )

            await uploadCode(uploadUrl, zipFileBuffer, zipFileChecksum, kmsKeyArn)
            return uploadId
        })

        this.uploadId = uploadId
        const nextState = new CodeGenState(
            { ...this.config, uploadId },
            '',
            this.filePaths,
            this.deletedFiles,
            this.references,
            this.tabID,
            this.currentIteration
        )
        return nextState.interact(action)
    }
}
