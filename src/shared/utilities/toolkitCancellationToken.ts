/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

export class ToolkitCancellationToken implements vscode.CancellationToken {
    public isCancellationRequested: boolean = false
    public onCancellationRequested: vscode.Event<any>

    private readonly onCancellationRequestedEmitter = new vscode.EventEmitter<void>()

    public constructor() {
        this.onCancellationRequested = this.onCancellationRequestedEmitter.event
        this.onCancellationRequested(() => { this.isCancellationRequested = true })
    }

    public requestCancellation(): void {
        this.onCancellationRequestedEmitter.fire()
    }
}
