/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * copied from https://github.com/microsoft/vscode/blob/e9d40443a2a09e4efa1ffc5c182b57f8485080da/src/vs/workbench/api/common/extHostTerminalService.ts#L832
 */
export class FakeEnvironmentVariableCollection implements vscode.EnvironmentVariableCollection {
    readonly map: Map<string, vscode.EnvironmentVariableMutator> = new Map()
    private _persistent: boolean = true

    public get persistent(): boolean {
        return this._persistent
    }
    public set persistent(value: boolean) {
        this._persistent = value
        this._onDidChangeCollection.fire()
    }

    protected readonly _onDidChangeCollection: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    get onDidChangeCollection(): vscode.Event<void> {
        return this._onDidChangeCollection && this._onDidChangeCollection.event
    }

    constructor() {
        this.map = new Map()
    }

    get size(): number {
        return this.map.size
    }

    replace(variable: string, value: string): void {
        this._setIfDiffers(variable, { value, type: vscode.EnvironmentVariableMutatorType.Replace })
    }

    append(variable: string, value: string): void {
        this._setIfDiffers(variable, { value, type: vscode.EnvironmentVariableMutatorType.Append })
    }

    prepend(variable: string, value: string): void {
        this._setIfDiffers(variable, { value, type: vscode.EnvironmentVariableMutatorType.Prepend })
    }

    private _setIfDiffers(variable: string, mutator: vscode.EnvironmentVariableMutator): void {
        const current = this.map.get(variable)
        if (!current || current.value !== mutator.value || current.type !== mutator.type) {
            this.map.set(variable, mutator)
            this._onDidChangeCollection.fire()
        }
    }

    get(variable: string): vscode.EnvironmentVariableMutator | undefined {
        return this.map.get(variable)
    }

    forEach(
        callback: (
            variable: string,
            mutator: vscode.EnvironmentVariableMutator,
            collection: vscode.EnvironmentVariableCollection
        ) => any,
        thisArg?: any
    ): void {
        this.map.forEach((value, key) => callback.call(thisArg, key, value, this))
    }

    delete(variable: string): void {
        this.map.delete(variable)
        this._onDidChangeCollection.fire()
    }

    clear(): void {
        this.map.clear()
        this._onDidChangeCollection.fire()
    }
}
