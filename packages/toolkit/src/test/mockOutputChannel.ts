/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export class MockOutputChannel implements vscode.OutputChannel {
    private _value: string = ''
    private _isShown: boolean = false
    private _isFocused: boolean = false

    public readonly name = 'Mock channel'

    private readonly onDidAppendTextEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter<string>()

    public get onDidAppendText(): vscode.Event<string> {
        return this.onDidAppendTextEmitter.event
    }

    public replace(value: string): void {
        this._value = value
        this.onDidAppendTextEmitter.fire(value)
    }

    public append(value: string): void {
        this._value += value
        this.onDidAppendTextEmitter.fire(value)
    }

    public appendLine(value: string) {
        this.append(value + '\n')
    }

    public clear(): void {
        this._value = ''
    }

    public dispose(): void {
        this._value = ''
    }

    public hide(): void {
        this._isShown = false
    }

    public get value(): string {
        return this._value
    }

    public get lines(): string[] {
        return this.value.trimRight().split('\n')
    }

    public get isShown(): boolean {
        return this._isShown
    }

    public get isFocused(): boolean {
        return this._isFocused
    }

    /**
     * This is overloaded by VS Code but viewColumn version is deprecated thus
     * show(preserveFocus?: boolean) is really what we should consider.
     */
    public show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
        this._isShown = true

        if (typeof columnOrPreserveFocus === 'boolean') {
            this._isFocused = !columnOrPreserveFocus
        } else if (typeof columnOrPreserveFocus !== 'undefined') {
            throw new TypeError('1st argument must be a boolean if provided. ViewColumn is deprecated')
        } else {
            this._isFocused = true
        }
    }
}
