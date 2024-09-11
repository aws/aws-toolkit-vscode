/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LRUCache } from 'lru-cache'
import { isTextDocument } from '../../shared/utilities/editorUtilities'

/**
 * Naive most recently opened files as VSCode doesn't expose its API which is used when clicking [ctrl] + [tab]
 * Related feature request https://github.com/microsoft/vscode/issues/136878
 * VSCode src code https://github.com/microsoft/vscode/blob/298e7037f027bf5e6add0e0eecaeda10e0195411/src/vs/workbench/browser/parts/editor/editorQuickAccess.ts#L265
 */
export class RecentlyUsedFileTracker implements vscode.Disposable {
    static #instance: RecentlyUsedFileTracker
    public static get instance() {
        return (this.#instance ??= new RecentlyUsedFileTracker())
    }

    private _disposable: vscode.Disposable | undefined
    private cache: LRUCache<string, vscode.TextDocument>

    constructor() {
        this.cache = new LRUCache({
            max: 20,
        })

        const activeEditor = vscode.window.activeTextEditor
        if (activeEditor) {
            this.cache.set(activeEditor.document.uri.fsPath, activeEditor.document)
        }

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
            })
        )
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
