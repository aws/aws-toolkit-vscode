/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export class MockOutputChannel implements vscode.OutputChannel {
    public value: string = ''
    public isHidden: boolean = false
    public preserveFocus: boolean = false

    public readonly name = 'Mock channel'

    public append(value: string): void {
        this.value += value
    }

    public appendLine(value: string) {
        this.value += value + '\n'
    }

    public clear(): void {
        this.value = ''
    }

    public dispose(): void {
        this.value = ''
    }

    public hide(): void {
        this.isHidden = true
    }

    /**
     * This is overloaded by VS Code but viewColumn version is deprecated thus
     * show(preserveFocus?: boolean) is really what we should consider.
     */
    public show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
        if (typeof columnOrPreserveFocus === 'boolean') {
            this.preserveFocus = columnOrPreserveFocus
        } else if (typeof columnOrPreserveFocus !== 'undefined') {
            throw new TypeError('1st argument must be a boolean if provided. ViewColumn is deprecated')
        }
        this.isHidden = false
    }
}
