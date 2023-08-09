/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs'

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

/**
 * Session keeps track of all the information related to a session, and persists session information to disk
 */
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
        if (false) {
            fs.readdirSync(this.workspaceRoot, (err, files: string[]) => {
                files.forEach(file => {
                    console.log(file)
                })
            })
        }

        const command = new InvokeCommand({
            FunctionName: 'arn:aws:lambda:eu-west-1:761763482860:function:tempFunc',
            Payload: JSON.stringify({
                original_file_contents: {},
                task: msg,
            }),
        })

        const { Payload } = await client.send(command)
        const result = Buffer.from(Payload!).toString()

        // Clean up the summary by stripping the description from the actual generated text contents
        const fileBeginnings = result.split('--BEGIN-FILE')
        const outputSummary = fileBeginnings.length > 0 ? fileBeginnings[0] : result

        this.history.push(outputSummary)

        return outputSummary
    }
}
