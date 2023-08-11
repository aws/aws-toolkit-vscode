/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

export class Session {
    public readonly history: string[]
    public readonly workspaceRoot: string
    public readonly sourceRoot: string
    private state: 'refinement' | 'codegen'
    private task: string = ''
    private instruction: string = ''

    // TODO remake private
    public onProgressEventEmitter: vscode.EventEmitter<string>
    public onProgressEvent: vscode.Event<string>

    // TODO remake private
    public onProgressFinishedEventEmitter: vscode.EventEmitter<void>
    public onProgressFinishedEvent: vscode.Event<void>

    constructor(history: string[], workspaceRoot: string) {
        this.history = history
        this.workspaceRoot = workspaceRoot
        this.sourceRoot = this.workspaceRoot + '/src'
        this.state = 'refinement'
        this.onProgressEventEmitter = new vscode.EventEmitter<string>()
        this.onProgressEvent = this.onProgressEventEmitter.event

        this.onProgressFinishedEventEmitter = new vscode.EventEmitter<void>()
        this.onProgressFinishedEvent = this.onProgressFinishedEventEmitter.event
    }

    async invokeLambda(arn: string, payload: any): Promise<any> {
        const client = new LambdaClient({
            region: 'eu-west-1',
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

    async send(msg: string) {
        try {
            return await this.sendUnsafe(msg)
        } catch (e: any) {
            return `Unexpected error happened`
        }
    }

    async sendUnsafe(msg: string) {
        const fileList = fs.readdirSync(path.join(this.workspaceRoot, 'src'))

        const files = fileList.reduce((map: any, fileName) => {
            const filePath = path.join(this.workspaceRoot, 'src', fileName)
            map[filePath] = fs.readFileSync(filePath).toString()
            return map
        }, {})
        if (msg.indexOf('WRITE CODE') !== -1) {
            this.state = 'codegen'
        } else {
            this.task = msg
        }
        if (this.state === 'refinement') {
            const payload = {
                original_file_contents: files,
                task: msg,
            }
            const result = await this.invokeLambda(
                'arn:aws:lambda:eu-west-1:761763482860:function:Weaverbird-Service-person-GenerateTaskLambdaEFA4E7-tNxFUYiHdp3z',
                payload
            )
            this.instruction = result.instruction
            return `${result.instruction}\n`
        } else {
            const payload = {
                original_file_contents: files,
                instruction: this.instruction,
                task: this.task,
            }
            const result = await this.invokeLambda(
                'arn:aws:lambda:eu-west-1:761763482860:function:Weaverbird-Service-person-GenerateCodeLambdaCDE418-KYgrsZ89ofdr',
                payload
            )

            for (const [filePath, fileContent] of Object.entries(result.new_file_contents)) {
                const pathUsed = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath)
                fs.mkdirSync(path.dirname(pathUsed), { recursive: true })
                fs.writeFileSync(pathUsed, fileContent as string)
            }

            return 'Changes to files done'
        }
    }
}
