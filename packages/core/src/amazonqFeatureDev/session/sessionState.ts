/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MynahIcons } from '@aws/mynah-ui'
import { randomUUID } from 'crypto'
import * as path from 'path'
import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { VirtualMemoryFile } from '../../shared/virtualMemoryFile'
import { featureDevScheme } from '../constants'
import { IllegalStateTransition, UserMessageNotFoundError } from '../errors'
import {
    CurrentWsFolders,
    DeletedFileInfo,
    FollowUpTypes,
    NewFileInfo,
    NewFileZipContents,
    SessionState,
    SessionStateAction,
    SessionStateConfig,
    SessionStateInteraction,
    SessionStatePhase,
} from '../types'
import { collectFiles, getWorkspaceFoldersByPrefixes, prepareRepoData } from '../util/files'
import { TelemetryHelper } from '../util/telemetryHelper'
import { uploadCode } from '../util/upload'
import { CodeReference } from '../../amazonq/webview/ui/connector'
import { isPresent } from '../../shared/utilities/collectionUtils'
import { encodeHTML } from '../../shared/utilities/textUtilities'
import { AuthUtil } from '../../codewhisperer/util/authUtil'

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
            span.record({
                amazonqConversationId: this.config.conversationId,
                credentialStartUrl: AuthUtil.instance.startUrl,
            })
            const { zipFileBuffer, zipFileChecksum } = await prepareRepoData(
                this.config.sourceRoots,
                this.config.workspaceFolders,
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
            if (action.msg && action.msg.includes('MOCK CODE')) {
                return new MockCodeGenState(this.config, this.approach, this.tabID).interact(action)
            }
            try {
                span.record({
                    amazonqConversationId: this.conversationId,
                    credentialStartUrl: AuthUtil.instance.startUrl,
                })
                action.telemetry.setGenerateApproachIteration(this.currentIteration)
                action.telemetry.setGenerateApproachLastInvocationTime()
                if (!action.msg) {
                    throw new UserMessageNotFoundError()
                }

                const { responseType, approach } = await this.config.proxyClient.generatePlan(
                    this.config.conversationId,
                    this.config.uploadId,
                    action.msg
                )

                this.approach = encodeHTML(
                    approach ??
                        'There has been a problem generating an approach. Please open a conversation in a new tab'
                )

                action.telemetry.recordUserApproachTelemetry(span, this.conversationId, responseType)
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
                        responseType,
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

function registerNewFiles(
    fs: VirtualFileSystem,
    newFileContents: NewFileZipContents[],
    uploadId: string,
    workspaceFolders: CurrentWsFolders
): NewFileInfo[] {
    const result: NewFileInfo[] = []
    const workspaceFolderPrefixes = getWorkspaceFoldersByPrefixes(workspaceFolders)
    for (const { zipFilePath, fileContent } of newFileContents) {
        const encoder = new TextEncoder()
        const contents = encoder.encode(fileContent)
        const generationFilePath = path.join(uploadId, zipFilePath)
        const uri = vscode.Uri.from({ scheme: featureDevScheme, path: generationFilePath })
        fs.registerProvider(uri, new VirtualMemoryFile(contents))
        const prefix =
            workspaceFolderPrefixes === undefined ? '' : zipFilePath.substring(0, zipFilePath.indexOf(path.sep))
        const folder = workspaceFolderPrefixes === undefined ? workspaceFolders[0] : workspaceFolderPrefixes[prefix]
        if (folder === undefined) {
            getLogger().error(`No workspace folder found for file: ${zipFilePath} and prefix: ${prefix}`)
            continue
        }
        result.push({
            zipFilePath,
            fileContent,
            virtualMemoryUri: uri,
            workspaceFolder: folder,
            relativePath: zipFilePath.substring(workspaceFolderPrefixes === undefined ? 0 : prefix.length + 1),
            rejected: false,
        })
    }

    return result
}

function getDeletedFileInfos(deletedFiles: string[], workspaceFolders: CurrentWsFolders): DeletedFileInfo[] {
    const workspaceFolderPrefixes = getWorkspaceFoldersByPrefixes(workspaceFolders)
    return deletedFiles
        .map(deletedFilePath => {
            const prefix =
                workspaceFolderPrefixes === undefined
                    ? ''
                    : deletedFilePath.substring(0, deletedFilePath.indexOf(path.sep))
            const folder = workspaceFolderPrefixes === undefined ? workspaceFolders[0] : workspaceFolderPrefixes[prefix]
            if (folder === undefined) {
                getLogger().error(`No workspace folder found for file: ${deletedFilePath} and prefix: ${prefix}`)
                return undefined
            }
            const prefixLength = workspaceFolderPrefixes === undefined ? 0 : prefix.length + 1
            return {
                zipFilePath: deletedFilePath,
                workspaceFolder: folder,
                relativePath: deletedFilePath.substring(prefixLength),
                rejected: false,
            }
        })
        .filter(isPresent)
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
        workspaceFolders,
    }: {
        fs: VirtualFileSystem
        codeGenerationId: string
        telemetry: TelemetryHelper
        workspaceFolders: CurrentWsFolders
    }): Promise<{
        newFiles: NewFileInfo[]
        deletedFiles: DeletedFileInfo[]
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
                    const newFileInfo = registerNewFiles(fs, newFileContents, this.uploadId, workspaceFolders)
                    telemetry.setNumberOfFilesGenerated(newFileInfo.length)
                    return {
                        newFiles: newFileInfo,
                        deletedFiles: getDeletedFileInfos(deletedFiles, workspaceFolders),
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
            deletedFiles: [],
            references: [],
        }
    }
}

export class CodeGenState extends CodeGenBase implements SessionState {
    constructor(
        config: SessionStateConfig,
        public approach: string,
        public filePaths: NewFileInfo[],
        public deletedFiles: DeletedFileInfo[],
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
                    workspaceFolders: this.config.workspaceFolders,
                })
                this.filePaths = codeGeneration.newFiles
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
    public filePaths: NewFileInfo[]
    public deletedFiles: DeletedFileInfo[]
    public readonly conversationId: string
    public readonly uploadId: string

    constructor(private config: SessionStateConfig, public approach: string, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.filePaths = []
        this.deletedFiles = []
        this.conversationId = this.config.conversationId
        this.uploadId = randomUUID()
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        // in a `mockcodegen` state, we should read from the `mock-data` folder and output
        // every file retrieved in the same shape the LLM would
        try {
            const files = await collectFiles(
                this.config.workspaceFolders.map(f => path.join(f.uri.fsPath, './mock-data')),
                this.config.workspaceFolders,
                false
            )
            const newFileContents = files.map(f => ({
                zipFilePath: f.zipFilePath,
                fileContent: f.fileContent,
            }))
            this.filePaths = registerNewFiles(action.fs, newFileContents, this.uploadId, this.config.workspaceFolders)
            this.deletedFiles = [
                {
                    zipFilePath: 'src/this-file-should-be-deleted.ts',
                    workspaceFolder: this.config.workspaceFolders[0],
                    relativePath: 'src/this-file-should-be-deleted.ts',
                    rejected: false,
                },
            ]
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
                        pillText: 'Insert code',
                        type: FollowUpTypes.InsertCode,
                        icon: 'ok' as MynahIcons,
                        status: 'success',
                    },
                    {
                        pillText: 'Provide feedback to regenerate',
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
        public filePaths: NewFileInfo[],
        public deletedFiles: DeletedFileInfo[],
        public references: CodeReference[],
        public tabID: string,
        private currentIteration: number
    ) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.uploadId = config.uploadId
        this.conversationId = config.conversationId
    }
    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        action.messenger.sendAnswer({
            message: 'Uploading code ...',
            type: 'answer-part',
            tabID: this.tabID,
        })

        const uploadId = await telemetry.amazonq_createUpload.run(async span => {
            const { zipFileBuffer, zipFileChecksum } = await prepareRepoData(
                this.config.sourceRoots,
                this.config.workspaceFolders,
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
