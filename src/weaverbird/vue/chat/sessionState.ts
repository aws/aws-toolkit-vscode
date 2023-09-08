/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'

import { LocalResolvedConfig } from '../../config'
import { MemoryFile } from '../../memoryFile'
import { LLMConfig } from './types'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { collectFiles } from '../../files'
import { FileMetadata } from '../../client/weaverbirdclient'
import { getLogger } from '../../../shared/logger'
import { FileSystemCommon } from '../../../srcShared/fs'

const fs = FileSystemCommon.instance

export interface UserInteraction {
    origin: 'user' | 'ai'
    type: 'message'
    content: string
}

export interface CodeGenInteraction {
    origin: 'ai'
    type: 'codegen'
    content: MemoryFile[]
    status?: 'accepted' | 'rejected'
}

export type Interaction = UserInteraction | CodeGenInteraction

export interface SessionStateInteraction {
    nextState: SessionState | undefined
    interactions: Interaction[]
}

export interface SessionState {
    approach: string
    tokenSource: vscode.CancellationTokenSource
    interact(action: SessionStateAction): Promise<SessionStateInteraction>
}

export interface SessionStateConfig {
    client: LambdaClient
    llmConfig: LLMConfig
    workspaceRoot: string
    backendConfig: LocalResolvedConfig
}

interface SessionStateAction {
    task: string
    files: FileMetadata[]
    msg?: string
    onAddToHistory: vscode.EventEmitter<Interaction[]>
}

type NewFileContents = { filePath: string; fileContent: string }[]

async function invoke(client: LambdaClient, arn: string, payload: unknown) {
    try {
        const response = await client.invoke(
            arn,
            JSON.stringify({
                body: JSON.stringify(payload),
            })
        )
        const rawResult = response.Payload!.toString()
        const result = JSON.parse(rawResult)
        return JSON.parse(result.body)
    } catch (e) {
        console.log(e)
    }
}

export class RefinementState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource

    constructor(private config: SessionStateConfig, public approach: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        const payload = {
            task: action.task,
            originalFileContents: action.files,
            config: this.config.llmConfig,
        }

        const response = await invoke(
            this.config.client,
            this.config.backendConfig.lambdaArns.approach.generate,
            payload
        )

        this.approach = response.background

        return {
            nextState: new RefinementIterationState(this.config, this.approach),
            interactions: [
                {
                    origin: 'ai',
                    type: 'message',
                    content: `${this.approach}\n`,
                },
            ],
        }
    }
}

class RefinementIterationState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource

    constructor(private config: SessionStateConfig, public approach: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        const payload = {
            task: action.task,
            request: action.msg,
            approach: this.approach,
            originalFileContents: action.files,
            config: this.config.llmConfig,
        }

        const response = await invoke(
            this.config.client,
            this.config.backendConfig.lambdaArns.approach.iterate,
            payload
        )

        this.approach = response.approach

        if (action.msg && action.msg.indexOf('WRITE CODE') !== -1) {
            return new CodeGenState(this.config, this.approach).interact(action)
        }

        if (action.msg && action.msg.indexOf('MOCK CODE') !== -1) {
            return new MockCodeGenState(this.config, this.approach).interact(action)
        }

        return {
            nextState: new RefinementIterationState(this.config, this.approach),
            interactions: [
                {
                    origin: 'ai',
                    type: 'message',
                    content: `${this.approach}\n`,
                },
            ],
        }
    }
}

async function createChanges(newFileContents: NewFileContents): Promise<Interaction[]> {
    const files: MemoryFile[] = []
    for (const { filePath, fileContent } of newFileContents) {
        // create the in-memory document
        const memfile = MemoryFile.createDocument(filePath)
        memfile.write(fileContent)
        files.push(memfile)
    }

    return [
        {
            origin: 'ai',
            type: 'message',
            content: 'Changes to files done. Please review:',
        },
        {
            origin: 'ai',
            type: 'codegen',
            content: files,
        },
    ]
}

export class CodeGenState implements SessionState {
    private pollCount = 60

    public tokenSource: vscode.CancellationTokenSource

    constructor(public config: SessionStateConfig, public approach: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        const payload = {
            originalFileContents: action.files,
            approach: this.approach,
            task: action.task,
            config: this.config.llmConfig,
        }

        const response = await invoke(
            this.config.client,
            this.config.backendConfig.lambdaArns.codegen.generate,
            payload
        )

        const genId = response.generationId

        action.onAddToHistory.fire([
            {
                origin: 'ai',
                type: 'message',
                content: 'Code generation started\n',
            },
        ])

        await this.generateCode(action.onAddToHistory, genId).catch(x => {
            getLogger().error(`Failed to generate code`)
        })

        return {
            nextState: new CodeGenIterationState(this.config, this.approach),
            interactions: [],
        }
    }

    private async generateCode(onAddToHistory: vscode.EventEmitter<Interaction[]>, generationId: string) {
        for (
            let pollingIteration = 0;
            pollingIteration < this.pollCount && !this.tokenSource.token.isCancellationRequested;
            ++pollingIteration
        ) {
            const payload = {
                generationId,
            }

            const codegenResult = await invoke(
                this.config.client,
                this.config.backendConfig.lambdaArns.codegen.getResults,
                payload
            )
            getLogger().info(`Codegen response: ${JSON.stringify(codegenResult)}`)

            if (codegenResult.status == 'ready') {
                const changes = await createChanges(codegenResult.result.newFileContents)
                onAddToHistory.fire(changes)
                return
            } else {
                await new Promise(f => setTimeout(f, 10000))
            }
        }
    }
}

export class MockCodeGenState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource

    constructor(private config: SessionStateConfig, public approach: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
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
                    filePath: f.filePath.replace('mock-data', '.'),
                    fileContent: f.fileContent,
                }))
            }
        } catch (e) {
            getLogger().error('Unable to use mock code generation: %O', e)
        }

        return {
            nextState: new CodeGenIterationState(this.config, this.approach),
            interactions: await createChanges(newFileContents),
        }
    }
}

class CodeGenIterationState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource

    constructor(private config: SessionStateConfig, public approach: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        const payload = {
            originalFileContents: action.files,
            approach: this.approach,
            task: action.task,
            comment: action.msg,
            config: this.config.llmConfig,
        }

        const response = await invoke(this.config.client, this.config.backendConfig.lambdaArns.codegen.iterate, payload)

        for (const { filePath, fileContent } of response.newFileContents!) {
            const pathUsed = path.isAbsolute(filePath) ? filePath : path.join(this.config.workspaceRoot, filePath)
            await fs.mkdir(path.dirname(pathUsed))
            await fs.writeFile(pathUsed, fileContent as string)
        }

        return {
            nextState: undefined,
            interactions: [{ origin: 'ai', type: 'message', content: 'Changes to files done' }],
        }
    }
}
