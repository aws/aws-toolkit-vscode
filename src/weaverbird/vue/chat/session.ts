/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

interface ResponseType {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    new_file_contents: object
    // eslint-disable-next-line @typescript-eslint/naming-convention
    deleted_files: string[]
}

export class Session {
    public readonly history: string[]
    public readonly workspaceRoot: string
    public readonly sourceRoot: string

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
        this.onProgressEventEmitter = new vscode.EventEmitter<string>()
        this.onProgressEvent = this.onProgressEventEmitter.event

        this.onProgressFinishedEventEmitter = new vscode.EventEmitter<void>()
        this.onProgressFinishedEvent = this.onProgressFinishedEventEmitter.event
    }

    async send(msg: string) {
        // TODO: figure out how to pass environment variables
        // We might need to pipe in the previous history here so we need to store that somewhere in the class

        const client = new LambdaClient({
            region: 'eu-west-1',
        })
        console.log(`WS: ${this.workspaceRoot}`)
        const fileList = fs.readdirSync(path.join(this.workspaceRoot, 'src'))

        const files = fileList.reduce((map: any, fileName) => {
            const filePath = path.join(this.workspaceRoot, 'src', fileName)
            map[filePath] = fs.readFileSync(filePath).toString()
            return map
        }, {})
        const payload = {
            original_file_contents: files,
            task: msg,
        }
        console.log(`Invoking lambda ${JSON.stringify(payload)}`)
        try {
            const command = new InvokeCommand({
                FunctionName: 'arn:aws:lambda:eu-west-1:761763482860:function:tempFunc',
                Payload: JSON.stringify(payload),
            })

            const { Payload } = await client.send(command)
            const rawResult = Buffer.from(Payload!).toString()
            console.log(rawResult)
            const result: ResponseType = JSON.parse(rawResult)
            console.log(result)

            for (const [filePath, fileContent] of Object.entries(result.new_file_contents)) {
                const pathUsed = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath)
                fs.mkdirSync(path.dirname(pathUsed), { recursive: true })
                fs.writeFileSync(pathUsed, fileContent)
            }

            return 'Changes to files done'
        } catch (e: any) {
            {
                return `Error happened: ${e}`
            }
        }
    }
}
