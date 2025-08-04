/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'

export interface DocumentChangeEvent {
    event: vscode.TextDocumentChangeEvent
    timestamp: number
}

export class DocumentEventListener {
    private lastDocumentChangeEventMap: Map<string, DocumentChangeEvent> = new Map()
    private documentChangeListener: vscode.Disposable
    private _maxDocument = 1000

    constructor() {
        this.documentChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.contentChanges.length > 0) {
                if (this.lastDocumentChangeEventMap.size > this._maxDocument) {
                    this.lastDocumentChangeEventMap.clear()
                }
                this.lastDocumentChangeEventMap.set(e.document.uri.fsPath, { event: e, timestamp: performance.now() })
                // The VS Code provideInlineCompletionCallback may not trigger when Enter is pressed, especially in Python files
                // manually make this trigger. In case of duplicate, the provideInlineCompletionCallback is already debounced
                if (this.isEnter(e) && vscode.window.activeTextEditor) {
                    void vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
                }
            }
        })
    }

    public isLastEventDeletion(filepath: string): boolean {
        const result = this.lastDocumentChangeEventMap.get(filepath)
        if (result) {
            const event = result.event
            const eventTime = result.timestamp
            const isDelete =
                (event && event.contentChanges.length === 1 && event.contentChanges[0].text === '') || false
            const timeDiff = Math.abs(performance.now() - eventTime)
            return timeDiff < 500 && isDelete
        }
        return false
    }

    public getLastDocumentChangeEvent(filepath: string): DocumentChangeEvent | undefined {
        return this.lastDocumentChangeEventMap.get(filepath)
    }

    public dispose(): void {
        if (this.documentChangeListener) {
            this.documentChangeListener.dispose()
        }
    }

    private isEnter(e: vscode.TextDocumentChangeEvent): boolean {
        if (e.contentChanges.length !== 1) {
            return false
        }
        const str = e.contentChanges[0].text
        if (str.length === 0) {
            return false
        }
        return (
            (str.startsWith('\r\n') && str.substring(2).trim() === '') ||
            (str[0] === '\n' && str.substring(1).trim() === '')
        )
    }
}
