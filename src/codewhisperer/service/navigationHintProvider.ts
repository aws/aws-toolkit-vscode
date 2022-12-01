/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * NavigationHintProvider
 */
export class NavigationHintProvider implements vscode.CodeLensProvider {
    private range: vscode.Range | undefined = undefined
    private hint: string = ''
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event

    constructor() {}

    static #instance: NavigationHintProvider

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public setNavigationHints(pos: vscode.Position) {
        this.range = new vscode.Range(pos, pos.translate(0, 1))
        this.hint = 'Press ← → to navigate available suggestions'
        this._onDidChangeCodeLenses.fire()
    }

    public removeNavigationHints() {
        this.range = undefined
        this._onDidChangeCodeLenses.fire()
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = []
        if (this.range) {
            const codeLens = new vscode.CodeLens(this.range)
            codeLens.command = {
                title: this.hint,
                tooltip: 'Press arrow key to see next or previous suggestion',
                command: '',
            }
            codeLenses.push(codeLens)
        }
        return codeLenses
    }
}
