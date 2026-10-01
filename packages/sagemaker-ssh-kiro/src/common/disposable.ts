/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This file contains code originally from https://github.com/jeanp413/open-remote-ssh
 * Original copyright: (c) 2022
 * Originally released under MIT license
 */

import * as vscode from 'vscode'

export function disposeAll(disposables: vscode.Disposable[]): void {
    while (disposables.length) {
        const item = disposables.pop()
        if (item) {
            item.dispose()
        }
    }
}

export abstract class Disposable {
    private _isDisposed = false

    protected _disposables: vscode.Disposable[] = []

    public dispose(): any {
        if (this._isDisposed) {
            return
        }
        this._isDisposed = true
        disposeAll(this._disposables)
    }

    protected _register<T extends vscode.Disposable>(value: T): T {
        if (this._isDisposed) {
            value.dispose()
        } else {
            this._disposables.push(value)
        }
        return value
    }

    protected get isDisposed(): boolean {
        return this._isDisposed
    }
}
