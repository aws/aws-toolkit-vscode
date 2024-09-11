/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LRUCache } from 'lru-cache'
import { isTextDocument } from '../../shared/utilities/editorUtilities'

export class RecentlyUsedFileTracker implements vscode.Disposable {
    static #instance: RecentlyUsedFileTracker
    public static get instance() {
        return (this.#instance ??= new RecentlyUsedFileTracker())
    }

    private _disposable: vscode.Disposable | undefined
    private cache: LRUCache<string, vscode.TextDocument>

    constructor() {
        const tabgroup = vscode.window.tabGroups.activeTabGroup
        const tabs = tabgroup.tabs
        console.log('tabs', tabs)

        this.cache = new LRUCache({
            max: 20,
        })

        this._disposable = vscode.Disposable.from(
            vscode.window.onDidChangeActiveTextEditor(async (e) => {
                const doc = e?.document
                if (!doc || !isTextDocument(doc)) {
                    return
                }

                this.cache.set(doc.uri.fsPath, doc)
            }),
            vscode.workspace.onDidCloseTextDocument((e) => {
                if (!isTextDocument(e)) {
                    return
                }

                this.cache.delete(e.uri.fsPath)
            }),
            vscode.workspace.onDidOpenTextDocument((e) => {
                if (!isTextDocument(e)) {
                    return
                }

                // console.log('onDidOpenTextDocument', e)
                // this.cache.set(e.uri.fsPath, e)
            }),
            vscode.window.onDidChangeTextEditorSelection(async (e) => {})
        )

        queueMicrotask(async () => await this.onActiveTextEditorChanged(vscode.window.activeTextEditor))
    }

    dispose() {
        this._disposable?.dispose()
    }

    // @VisibleForTesting
    async onActiveTextEditorChanged(editor: vscode.TextEditor | undefined) {}

    // @VisibleForTesting
    async onTextEditorSelectionChanged(e: vscode.TextEditorSelectionChangeEvent) {}

    listFiles() {
        const generator = this.cache.entries()
        return [...generator]
    }
}
