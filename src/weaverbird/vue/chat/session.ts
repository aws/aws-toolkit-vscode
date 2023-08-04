/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { ChildProcess } from '../../../shared/utilities/childProcess'

export class Session {
    private history: string[]
    private workspaceRoot: string

    // TODO remake private
    public onProgressEventEmitter: vscode.EventEmitter<string>
    public onProgressEvent: vscode.Event<string>

    // TODO remake private
    public onProgressFinishedEventEmitter: vscode.EventEmitter<void>
    public onProgressFinishedEvent: vscode.Event<void>

    constructor(history: string[], workspaceRoot: string) {
        this.history = history
        this.workspaceRoot = workspaceRoot
        this.onProgressEventEmitter = new vscode.EventEmitter<string>()
        this.onProgressEvent = this.onProgressEventEmitter.event

        this.onProgressFinishedEventEmitter = new vscode.EventEmitter<void>()
        this.onProgressFinishedEvent = this.onProgressFinishedEventEmitter.event
    }

    async send(msg: string) {
        // TODO: figure out how to pass environment variables
        // We might need to pipe in the previous history here so we need to store that somewhere in the class
        const result = await new ChildProcess(
            '/usr/local/bin/python3',
            // TODO: Currently adding /src to the end of the workspace path. How should this actually work?
            [
                path.join(__dirname, '../../llm/claude.py'),
                '--query',
                `"${msg}"`,
                '--workspace',
                this.workspaceRoot + '/src',
            ],
            {
                spawnOptions: {
                    env: {
                        ANTHROPIC_API_KEY: '',
                    },
                },
            }
        ).run({
            onStdout: text => console.log(`hey-claude: ${text}`),
            onStderr: text => console.log(`hey-claude: ${text}`),
        })

        if (result.error) {
            console.log(result.stderr)
            return Promise.resolve('Unable to interact with hey-claude')
        }

        // Clean up the summary by stripping the description from the actual generated text contents
        const fileBeginnings = result.stdout.split('--BEGIN-FILE')
        const outputSummary = fileBeginnings.length > 0 ? fileBeginnings[0] : result.stdout

        this.history.push(outputSummary)

        return outputSummary
    }
}
