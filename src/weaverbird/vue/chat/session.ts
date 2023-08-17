/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

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
        this.history.push('')
        return ''
    }
}
