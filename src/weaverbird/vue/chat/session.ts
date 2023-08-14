/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createWeaverbirdSdkClient } from '../../client/weaverbird'

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
        return (await client.echo().promise()).string ?? ''
    }
}
