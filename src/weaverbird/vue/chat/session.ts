/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { getLogger } from '../../../shared/logger/logger'
import { FileMetadata } from '../../client/weaverbirdclient'

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { getConfig } from '../../config'
import { MemoryFile } from '../../memoryFile'
import { defaultLlmConfig } from './constants'
import { LLMConfig } from './types'

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

export class Session {
    // TODO remake private
    public onProgressEventEmitter: vscode.EventEmitter<string>
    public onProgressEvent: vscode.Event<string>

    public workspaceRoot: string
    // `mockcodegen` is introduced temporarily to bypass the LLM for testing the FE alone
    private state:
        | 'refinement'
        | 'refinement-iteration'
        | 'codegen'
        | 'codegen-done'
        | 'mockcodegen'
        | 'codegen-iteration'
    private task: string = ''
    private generationId: string = ''
    private approach: string = ''
    private llmConfig = defaultLlmConfig

    public onAddToHistory: vscode.EventEmitter<Interaction[]>

    // TODO remake private
    public onProgressFinishedEventEmitter: vscode.EventEmitter<void>
    public onProgressFinishedEvent: vscode.Event<void>

    constructor(workspaceRoot: string, onAddToHistory: vscode.EventEmitter<Interaction[]>) {
        this.workspaceRoot = workspaceRoot
        this.onProgressEventEmitter = new vscode.EventEmitter<string>()
        this.state = 'refinement'
        this.onProgressEvent = this.onProgressEventEmitter.event

        this.onAddToHistory = onAddToHistory
        this.onProgressFinishedEventEmitter = new vscode.EventEmitter<void>()
        this.onProgressFinishedEvent = this.onProgressFinishedEventEmitter.event
    }

    async invokeApiGWLambda(arn: string, payload: any): Promise<any> {
        const truePayload = {
            // apigateway-style lambda
            body: JSON.stringify(payload),
        }
        const apiGWRes = await this.invokeLambda(arn, truePayload)
        return JSON.parse(apiGWRes.body)
    }

    async invokeLambda(arn: string, payload: any): Promise<any> {
        const config = await getConfig()
        const client = new LambdaClient({
            region: config.region,
        })

        const command = new InvokeCommand({
            FunctionName: arn,
            Payload: JSON.stringify(payload),
        })

        console.log(`Invoking ${arn} with payload ${JSON.stringify(payload)}`)

        const { Payload } = await client.send(command)
        const rawResult = Buffer.from(Payload!).toString()
        console.log(rawResult)
        return JSON.parse(rawResult)
    }

    async generateCode() {
        const config = await getConfig()
        for (let pollingIteration = 0; pollingIteration < 60 && this.state == 'codegen'; ++pollingIteration) {
            const payload = {
                generationId: this.generationId,
            }
            const codegenResult = await this.invokeApiGWLambda(config.lambdaArns.codegen.getResults, payload)
            getLogger().info(`Codegen response: ${JSON.stringify(codegenResult)}`)
            if (codegenResult.status == 'ready') {
                const result: { newFileContents: { filePath: string; fileContent: string }[] } = codegenResult.result
                const files = []
                for (const { filePath, fileContent } of result.newFileContents!) {
                    // create the in-memory document
                    const memfile = MemoryFile.createDocument(filePath)
                    memfile.write(fileContent)
                    files.push(memfile)
                }
                this.onAddToHistory.fire([
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
                ])
                this.state = 'codegen-done'
            } else {
                await new Promise(f => setTimeout(f, 5000))
            }
        }
    }

    async send(msg: string): Promise<Interaction | Interaction[]> {
        try {
            getLogger().info(`Received message from chat view: ${msg}`)
            return await this.sendUnsafe(msg)
        } catch (e: any) {
            getLogger().error(e)
            return {
                origin: 'ai',
                type: 'message',
                content: `Received error: ${e.code} and status code: ${e.statusCode} [${e.message}] when trying to send the request to the Weaverbird API`,
            }
        }
    }

    public setLLMConfig(config: LLMConfig) {
        this.llmConfig = config
    }

    async collectFiles(rootPath: string, prefix: string, storage: FileMetadata[]) {
        const fileList = fs.readdirSync(rootPath)

        fileList.forEach(filePath => {
            const realPath = path.join(rootPath, filePath)
            // llms are fine-tuned to use posix path. Don't expect miracles otherwise
            const posixPath = path.posix.join(prefix, filePath)
            if (fs.lstatSync(realPath).isDirectory()) {
                this.collectFiles(realPath, posixPath, storage)
            } else {
                storage.push({
                    filePath: posixPath,
                    fileContent: fs.readFileSync(realPath).toString(),
                } as FileMetadata)
            }
        })
    }

    // used for reading the mocked files from workspace
    readFilesRecursive(rootPath: string, results: string[] = []) {
        const fileList = fs.readdirSync(rootPath)
        for (const file of fileList) {
            const name = `${rootPath}/${file}`
            if (fs.statSync(name).isDirectory()) {
                this.readFilesRecursive(name, results)
            } else {
                results.push(name)
            }
        }
        return results
    }

    async sendUnsafe(msg: string): Promise<Interaction | Interaction[]> {
        //const client = await createWeaverbirdSdkClient();
        const config = await getConfig()

        const files: FileMetadata[] = []
        this.collectFiles(path.join(this.workspaceRoot, 'src'), 'src', files)

        if (msg.indexOf('WRITE CODE') !== -1) {
            this.state = 'codegen'
        }
        // The `MOCK CODE` command is added temporarily to bypass the LLM
        if (msg.indexOf('MOCK CODE') !== -1) {
            this.state = 'mockcodegen'
        }

        if (msg === 'CLEAR') {
            this.state = 'refinement'
            this.task = ''
            this.approach = ''
            const message =
                'Finished the session for you. Feel free to restart the session by typing the task you want to achieve.'
            return {
                origin: 'ai',
                type: 'message',
                content: message,
            }
        }

        if (this.state === 'refinement') {
            this.task = msg
            const payload = {
                task: this.task,
                originalFileContents: files,
                config: this.llmConfig,
            }

            /*
                const result = (await client.generateApproach(payload).promise())
            */
            const result = await this.invokeApiGWLambda(config.lambdaArns.approach.generate, payload)

            // change the state to be refinement-iteration so that the next message from user will invoke iterateApproach lambda
            this.state = 'refinement-iteration'
            this.approach = result.approach!
            const message = `${result.approach}\n`
            return {
                origin: 'ai',
                type: 'message',
                content: message,
            }
        } else if (this.state === 'refinement-iteration') {
            const payload = {
                task: this.task,
                request: msg,
                approach: this.approach,
                originalFileContents: files,
                config: this.llmConfig,
            }

            /*
                const result = (await client.iterateApproach(payload).promise())
            */
            const result = await this.invokeApiGWLambda(config.lambdaArns.approach.iterate, payload)
            this.approach = result.approach!
            const message = `${result.approach}\n`
            return {
                origin: 'ai',
                type: 'message',
                content: message,
            }
        } else if (this.state === 'codegen') {
            const payload = {
                originalFileContents: files,
                approach: this.approach,
                task: this.task,
                config: this.llmConfig,
            }

            const codegenStartResult = await this.invokeApiGWLambda(config.lambdaArns.codegen.generate, payload)
            this.generationId = codegenStartResult.generationId
            this.generateCode().catch(x => {
                getLogger().error(`Failed to generate code`)
            })
            return {
                origin: 'ai',
                type: 'message',
                content: 'Code generation started\n',
            }
        } else if (this.state === 'mockcodegen') {
            const result: { newFileContents: { filePath: string; fileContent: string }[] } = {
                newFileContents: [],
            }
            // in a `mockcodegen` state, we should read from the `mock-data` folder and output
            // every file retrieved in the same shape the LLM would
            const mockedFilesDir = path.join(this.workspaceRoot, './mock-data')
            if (fs.existsSync(mockedFilesDir)) {
                const mockedFiles = this.readFilesRecursive(mockedFilesDir)
                for (const mockedFilePath of mockedFiles) {
                    const mockedFileContent = fs.readFileSync(mockedFilePath)
                    const correctedFilePath = vscode.workspace.asRelativePath(mockedFilePath).replace('mock-data', '.')
                    result.newFileContents.push({
                        filePath: correctedFilePath,
                        fileContent: mockedFileContent.toString(),
                    })
                }
            }

            const files = []
            for (const { filePath, fileContent } of result.newFileContents!) {
                // create the in-memory document
                const memfile = MemoryFile.createDocument(filePath)
                memfile.write(fileContent)
                files.push(memfile)
            }
            this.state = 'codegen-iteration'
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
        } else {
            const payload = {
                originalFileContents: files,
                approach: this.approach,
                task: this.task,
                comment: msg,
                config: this.llmConfig,
            }
            /*
                const result = (await client.iterateCode(payload).promise())
            */

            const result = await this.invokeApiGWLambda(config.lambdaArns.codegen.iterate, payload)

            for (const { filePath, fileContent } of result.newFileContents!) {
                const pathUsed = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath)
                fs.mkdirSync(path.dirname(pathUsed), { recursive: true })
                fs.writeFileSync(pathUsed, fileContent as string)
            }
            return { origin: 'ai', type: 'message', content: 'Changes to files done' }
        }
    }
}
