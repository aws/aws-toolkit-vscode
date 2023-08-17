/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createWeaverbirdSdkClient } from '../../client/weaverbird'
import * as fs from 'fs'
import * as path from 'path'
import { FileMetadata, FileMetadataList } from '../../client/weaverbirdclient'

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

    async send(msg: string): Promise<string> {
        try {
            return await this.sendUnsafe(msg)
        } catch (e: any) {
            console.log(e)
            return `Unexpected error happened`
        }
    }

    async sendUnsafe(msg: string): Promise<string> {
        const client = await createWeaverbirdSdkClient()

        const fileList = fs.readdirSync(path.join(this.workspaceRoot, 'src'))

        const files: FileMetadataList = fileList.map(fileName => {
            const filePath = path.join(this.workspaceRoot, 'src', fileName)
            return {
                filePath,
                fileContent: fs.readFileSync(filePath).toString(),
            } as FileMetadata
        })

        if (msg.indexOf('WRITE CODE') !== -1) {
            this.state = 'codegen'
        } else {
            this.task = msg
        }
        if (this.state === 'refinement') {
            console.log(
                JSON.stringify({
                    task: this.task,
                    originalFileContents: files,
                })
            )
            const result = await client
                .generateApproach({
                    task: this.task,
                    originalFileContents: files,
                })
                .promise()
            this.approach = result.approach!
            return `${result.approach}\n`
        } else {
            const result = await client
                .generateCode({
                    task: this.task,
                    approach: this.approach,
                    originalFileContents: files,
                })
                .promise()

            for (const { filePath, fileContent } of result.newFileContents!) {
                const pathUsed = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath)
                fs.mkdirSync(path.dirname(pathUsed), { recursive: true })
                fs.writeFileSync(pathUsed, fileContent as string)
            }

            return 'Changes to files done'
        }
    }
}
