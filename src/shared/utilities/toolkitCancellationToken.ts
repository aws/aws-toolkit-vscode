/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

export class ToolkitCancellationToken implements vscode.CancellationToken {
    public onCancellationRequested: vscode.Event<any>
    private _isCancellationRequested: boolean = false

    private readonly onCancellationRequestedEmitter = new vscode.EventEmitter<void>()

    public constructor() {
        this.onCancellationRequested = this.onCancellationRequestedEmitter.event
        this.onCancellationRequested(() => { this._isCancellationRequested = true })
    }

    public requestCancellation(): void {
        if (!this._isCancellationRequested) {
            this.onCancellationRequestedEmitter.fire()
        }
    }

    public get isCancellationRequested(): boolean {
        return this._isCancellationRequested
    }
}
