/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'

import { collectFiles, getFilePaths } from '../util/files'
import {
    FileMetadata,
    GenerateApproachInput,
    GenerateApproachOutput,
    GenerateCodeInput,
    GenerateCodeOutput,
    GetCodeGenerationResultInput,
    GetCodeGenerationResultOutput,
    IterateApproachInput,
    IterateApproachOutput,
    IterateCodeInput,
    IterateCodeOutput,
} from '../client/weaverbirdclient'
import { getLogger } from '../../shared/logger'
import { FileSystemCommon } from '../../srcShared/fs'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { VirtualMemoryFile } from '../../shared/virtualMemoryFile'
import { weaverbirdScheme } from '../constants'
import {
    Interaction,
    SessionStateAction,
    SessionStateConfig,
    SessionStateInteraction,
    SessionState,
    NewFileContents,
    SessionStatePhase,
} from '../types'
import { invoke } from '../util/invoke'
import { Messenger } from '../controllers/chat/messenger/messenger'
import globals from '../../shared/extensionGlobals'

const fs = FileSystemCommon.instance

export class RefinementState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = SessionStatePhase.Approach

    constructor(
        private config: Omit<SessionStateConfig, 'conversationId'>,
        public approach: string,
        public tabID: string
    ) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        const payload = {
            task: action.task,
            originalFileContents: action.files,
            config: this.config.llmConfig,
        }

        const response = await invoke<GenerateApproachInput, GenerateApproachOutput>(
            this.config.client,
            this.config.backendConfig.lambdaArns.approach.generate,
            payload
        )

        this.approach =
            response.approach ?? "There has been a problem generating an approach. Please type 'CLEAR' and start over."

        return {
            nextState: new RefinementIterationState(
                {
                    ...this.config,
                    conversationId: response.conversationId,
                },
                this.approach,
                this.tabID
            ),
            interactions: {
                content: [`${this.approach}\n`],
            },
        }
    }
}

export class RefinementIterationState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = SessionStatePhase.Approach
    public readonly conversationId: string

    constructor(private config: SessionStateConfig, public approach: string, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.conversationId = config.conversationId
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        if (action.msg && action.msg.indexOf('MOCK CODE') !== -1) {
            return new MockCodeGenState(this.config, this.approach, this.tabID).interact(action)
        }

        const payload: IterateApproachInput = {
            task: action.task,
            request: action.msg ?? '',
            approach: this.approach,
            originalFileContents: action.files,
            config: this.config.llmConfig,
            conversationId: this.config.conversationId,
        }

        const response = await invoke<IterateApproachInput, IterateApproachOutput>(
            this.config.client,
            this.config.backendConfig.lambdaArns.approach.iterate,
            payload
        )

        this.approach =
            response.approach ?? "There has been a problem generating an approach. Please type 'CLEAR' and start over."

        return {
            nextState: new RefinementIterationState(this.config, this.approach, this.tabID),
            interactions: {
                content: [`${this.approach}\n`],
            },
        }
    }
}

async function createChanges(fs: VirtualFileSystem, newFileContents: NewFileContents): Promise<Interaction> {
    const filePaths: string[] = []
    for (const { filePath, fileContent } of newFileContents) {
        const encoder = new TextEncoder()
        const contents = encoder.encode(fileContent)
        const uri = vscode.Uri.from({ scheme: weaverbirdScheme, path: filePath })
        fs.registerProvider(uri, new VirtualMemoryFile(contents))
        filePaths.push(filePath)
    }

    return {
        content: ['Changes to files done. Please review:'],
        filePaths,
    }
}

abstract class CodeGenBase {
    private pollCount = 60
    private requestDelay = 10000
    readonly tokenSource: vscode.CancellationTokenSource
    public phase = SessionStatePhase.Codegen
    public readonly conversationId: string

    constructor(protected config: SessionStateConfig, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.conversationId = config.conversationId
    }

    async generateCode(params: {
        getResultLambdaArn: string
        fs: VirtualFileSystem
        messenger: Messenger
        generationId: string
    }) {
        for (
            let pollingIteration = 0;
            pollingIteration < this.pollCount && !this.tokenSource.token.isCancellationRequested;
            ++pollingIteration
        ) {
            const payload: GetCodeGenerationResultInput = {
                generationId: params.generationId,
                conversationId: this.config.conversationId,
            }

            const codegenResult = await invoke<GetCodeGenerationResultInput, GetCodeGenerationResultOutput>(
                this.config.client,
                params.getResultLambdaArn,
                payload
            )
            getLogger().info(`Codegen response: ${JSON.stringify(codegenResult)}`)

            switch (codegenResult.codeGenerationStatus) {
                case 'ready': {
                    const newFiles = codegenResult.result?.newFileContents ?? []
                    const changes = await createChanges(params.fs, newFiles)
                    for (const change of changes.content) {
                        params.messenger.sendResponse(
                            {
                                message: change,
                            },
                            this.tabID
                        )
                    }
                    if (changes.filePaths && changes.filePaths.length > 0) {
                        // Show the file tree component when file paths are present
                        params.messenger.sendFilePaths(changes.filePaths, this.tabID, this.config.conversationId)
                    }
                    return newFiles
                }
                case 'predict-ready': {
                    await new Promise(f => globals.clock.setTimeout(f, this.requestDelay))
                    break
                }
                case 'in-progress': {
                    await new Promise(f => globals.clock.setTimeout(f, this.requestDelay))
                    break
                }
                case 'predict-failed':
                case 'debate-failed':
                case 'failed': {
                    getLogger().error('Failed to generate code')
                    params.messenger.sendErrorMessage('Code generation failed\n', this.tabID)
                    return []
                }
                default: {
                    const errorMessage = `Unknown status: ${codegenResult.codeGenerationStatus}\n`
                    getLogger().error(errorMessage)
                    params.messenger.sendErrorMessage(errorMessage, this.tabID)
                    return []
                }
            }
        }
        if (!this.tokenSource.token.isCancellationRequested) {
            // still in progress
            const errorMessage = `Code generation did not finish withing the expected time :(`
            getLogger().error(errorMessage)
            params.messenger.sendErrorMessage(errorMessage, this.tabID)
        }
        return []
    }
}

export class CodeGenState extends CodeGenBase implements SessionState {
    public filePaths?: string[]

    constructor(config: SessionStateConfig, public approach: string, tabID: string) {
        super(config, tabID)
        this.filePaths = []
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        const payload: GenerateCodeInput = {
            originalFileContents: action.files,
            approach: this.approach,
            task: action.task,
            config: this.config.llmConfig,
            conversationId: this.config.conversationId,
        }

        const response = await invoke<GenerateCodeInput, GenerateCodeOutput>(
            this.config.client,
            this.config.backendConfig.lambdaArns.codegen.generate,
            payload
        )

        const genId = response.generationId

        action.messenger.sendResponse(
            {
                message: 'Code generation started\n',
            },
            this.tabID
        )

        const newFileContents = await this.generateCode({
            getResultLambdaArn: this.config.backendConfig.lambdaArns.codegen.getResults,
            fs: action.fs,
            messenger: action.messenger,
            generationId: genId,
        }).catch(_ => {
            getLogger().error(`Failed to generate code`)
            return []
        })
        this.filePaths = getFilePaths(newFileContents)

        const nextState = new CodeGenIterationState(
            this.config,
            this.approach,
            newFileContents,
            this.filePaths,
            this.tabID
        )

        return {
            nextState,
            interactions: {
                content: [],
            },
        }
    }
}

export class MockCodeGenState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public filePaths?: string[]

    constructor(
        private config: Omit<SessionStateConfig, 'conversationId'>,
        public approach: string,
        public tabID: string
    ) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.filePaths = []
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        let newFileContents: NewFileContents = []

        // in a `mockcodegen` state, we should read from the `mock-data` folder and output
        // every file retrieved in the same shape the LLM would
        const mockedFilesDir = path.join(this.config.workspaceRoot, './mock-data')
        try {
            const mockDirectoryExists = await fs.stat(mockedFilesDir)
            if (mockDirectoryExists) {
                const files = await collectFiles(mockedFilesDir)
                newFileContents = files.map(f => ({
                    filePath: f.filePath.replace('mock-data/', ''),
                    fileContent: f.fileContent,
                }))
                this.filePaths = getFilePaths(newFileContents)
            }
        } catch (e) {
            // TODO: handle this error properly, double check what would be expected behaviour if mock code does not work.
            getLogger().error('Unable to use mock code generation: %O', e)
        }

        return {
            // no point in iterating after a mocked code gen
            nextState: new RefinementState(this.config, this.approach, this.tabID),
            interactions: await createChanges(action.fs, newFileContents),
        }
    }
}

export class CodeGenIterationState extends CodeGenBase implements SessionState {
    constructor(
        config: SessionStateConfig,
        public approach: string,
        private newFileContents: FileMetadata[],
        public filePaths: string[],
        tabID: string
    ) {
        super(config, tabID)
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        const fileContents = [...this.newFileContents].concat(
            ...action.files.filter(
                originalFile => !this.newFileContents.some(newFile => newFile.filePath === originalFile.filePath)
            )
        )
        const payload: IterateCodeInput = {
            originalFileContents: fileContents,
            approach: this.approach,
            task: action.task,
            comment: action.msg ?? '',
            config: this.config.llmConfig,
            conversationId: this.config.conversationId,
        }

        const response = await invoke<IterateCodeInput, IterateCodeOutput>(
            this.config.client,
            // going to the `generate` lambda here because the `iterate` one doesn't work on a
            // task/poll-results strategy yet
            this.config.backendConfig.lambdaArns.codegen.iterate,
            payload
        )

        const genId = response.generationId

        action.messenger.sendResponse(
            {
                message: 'Code generation started\n',
            },
            this.tabID
        )

        this.newFileContents = await this.generateCode({
            getResultLambdaArn: this.config.backendConfig.lambdaArns.codegen.getIterationResults,
            fs: action.fs,
            messenger: action.messenger,
            generationId: genId,
        }).catch(_ => {
            getLogger().error(`Failed to generate code`)
            return []
        })
        this.filePaths = getFilePaths(this.newFileContents)

        return {
            nextState: this,
            interactions: {
                content: ['Changes to files done'],
            },
        }
    }
}
