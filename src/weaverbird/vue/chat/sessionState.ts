/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

import { LocalResolvedConfig } from '../../config'
import { MemoryFile } from '../../memoryFile'
import { LLMConfig } from './types'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { readFilesRecursive } from './files'
import { FileMetadata } from '../../client/weaverbirdclient'
import { getLogger } from '../../../shared/logger'

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

export interface SessionState {
    approach: string
    tokenSource: vscode.CancellationTokenSource
    interact(action: SessionStateAction): Promise<Interaction[]>
    next(): SessionState | undefined
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

    async interact(action: SessionStateAction): Promise<Interaction[]> {
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

        return [
            {
                origin: 'ai',
                type: 'message',
                content: `${this.approach}\n`,
            },
        ]
    }

    next(): SessionState {
        return new RefinementIterationState(this.config, this.approach)
    }
}

class RefinementIterationState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource

    constructor(private config: SessionStateConfig, public approach: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    async interact(action: SessionStateAction): Promise<Interaction[]> {
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

        return [
            {
                origin: 'ai',
                type: 'message',
                content: `${this.approach}\n`,
            },
        ]
    }

    next(): SessionState | undefined {
        return undefined
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

    constructor(
        public config: SessionStateConfig,
        public approach: string,
        private onAddToHistory: vscode.EventEmitter<Interaction[]>
    ) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    async interact(action: SessionStateAction): Promise<Interaction[]> {
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

        this.onAddToHistory.fire([
            {
                origin: 'ai',
                type: 'message',
                content: 'Code generation started\n',
            },
        ])

        await this.generateCode(genId).catch(x => {
            getLogger().error(`Failed to generate code`)
        })

        return []
    }

    private async generateCode(generationId: string) {
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
                this.onAddToHistory.fire(changes)
                return
            } else {
                await new Promise(f => setTimeout(f, 10000))
            }
        }
    }

    next(): SessionState | undefined {
        return new CodeGenIterationState(this.config, this.approach)
    }
}

export class MockCodeGenState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource

    constructor(private config: SessionStateConfig, public approach: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    async interact(action: SessionStateAction): Promise<Interaction[]> {
        const newFileContents: NewFileContents = []

        // in a `mockcodegen` state, we should read from the `mock-data` folder and output
        // every file retrieved in the same shape the LLM would
        const mockedFilesDir = path.join(this.config.workspaceRoot, './mock-data')
        if (fs.existsSync(mockedFilesDir)) {
            const mockedFiles = readFilesRecursive(mockedFilesDir)
            for (const mockedFilePath of mockedFiles) {
                const mockedFileContent = fs.readFileSync(mockedFilePath)
                const correctedFilePath = vscode.workspace.asRelativePath(mockedFilePath).replace('mock-data', '.')
                newFileContents.push({
                    filePath: correctedFilePath,
                    fileContent: mockedFileContent.toString(),
                })
            }
        }

        return createChanges(newFileContents)
    }

    next(): SessionState | undefined {
        return new CodeGenIterationState(this.config, this.approach)
    }
}

class CodeGenIterationState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource

    constructor(private config: SessionStateConfig, public approach: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    async interact(action: SessionStateAction): Promise<Interaction[]> {
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
            fs.mkdirSync(path.dirname(pathUsed), { recursive: true })
            fs.writeFileSync(pathUsed, fileContent as string)
        }

        return [{ origin: 'ai', type: 'message', content: 'Changes to files done' }]
    }

    next(): SessionState | undefined {
        return undefined
    }
}
