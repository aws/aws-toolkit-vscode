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

export class Session {
    public readonly workspaceRoot: string
    private state: 'refinement' | 'codegen'
    private task: string = ''
    private approach: string = ''

    // TODO remake private
    public onProgressEventEmitter: vscode.EventEmitter<string>
    public onProgressEvent: vscode.Event<string>

    // TODO remake private
    public onProgressFinishedEventEmitter: vscode.EventEmitter<void>
    public onProgressFinishedEvent: vscode.Event<void>

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot
        this.state = 'refinement'
        this.onProgressEventEmitter = new vscode.EventEmitter<string>()
        this.onProgressEvent = this.onProgressEventEmitter.event

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
        const client = new LambdaClient({
            region: 'us-west-2',
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

    async send(msg: string): Promise<string> {
        try {
            getLogger().info(`Received message from chat view: ${msg}`)
            return await this.sendUnsafe(msg)
        } catch (e: any) {
            getLogger().error(e)
            return `Received error: ${e.code} and status code: ${e.statusCode} when trying to send the request to the Weaverbird API`
        }
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

    async sendUnsafe(msg: string): Promise<string> {
        //const client = await createWeaverbirdSdkClient();

        const files: FileMetadata[] = []
        this.collectFiles(path.join(this.workspaceRoot, 'src'), 'src', files)

        if (msg.indexOf('WRITE CODE') !== -1) {
            this.state = 'codegen'
        } else {
            this.task = msg
        }
        if (this.state === 'refinement') {
            const payload = {
                task: this.task,
                originalFileContents: files,
            }

            /*
                const result = (await client.generateApproach(payload).promise())
            */
            const result = await this.invokeApiGWLambda(
                'arn:aws:lambda:us-west-2:789621683470:function:WeaverbirdService-Service-GenerateApproachLambda47-VIjB8vZYS3Iu',
                payload
            )
            this.approach = result.approach!
            return `${result.approach}\n`
        } else {
            const payload = {
                originalFileContents: files,
                approach: this.approach,
                task: this.task,
            }
            /*
                const result = (await client.generateCode(payload).promise())
            */

            const result = await this.invokeApiGWLambda(
                'arn:aws:lambda:us-west-2:789621683470:function:WeaverbirdService-Service-GenerateCodeLambdaCDE418-nXvafUVY7rmw',
                payload
            )

            for (const { filePath, fileContent } of result.newFileContents!) {
                const pathUsed = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath)
                fs.mkdirSync(path.dirname(pathUsed), { recursive: true })
                fs.writeFileSync(pathUsed, fileContent as string)
            }
            this.state = 'refinement'
            return 'Changes to files done'
        }
    }
}
