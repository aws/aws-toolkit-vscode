/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LineSelection, LineTracker, LinesChangeEvent } from './lineTracker'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { InlineDecorator } from './annotationUtils'
import { debounce } from '../../../shared/utilities/functionUtils'
import { waitUntil } from '../../../shared/utilities/timeoutUtils'
import { Container } from '../../service/serviceContainer'

const maxSmallIntegerV8 = 2 ** 30 // Max number that can be stored in V8's smis (small integers)

function once<T>(event: vscode.Event<T>): vscode.Event<T> {
    return (listener: (e: T) => unknown, thisArgs?: unknown) => {
        const result = event(e => {
            result.dispose()
            return listener.call(thisArgs, e)
        })

        return result
    }
}

export class LineAnnotationController implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined
    private _suspended = false

    constructor(private readonly lineTracker: LineTracker, private readonly _cwInlineHintDecorator: InlineDecorator) {
        this._disposable = vscode.Disposable.from(once(this.lineTracker.onReady)(this.onReady, this))
        this.setLineTracker(true)
        // this.onReady()
    }

    dispose() {
        this.lineTracker.unsubscribe(this)
        this._disposable.dispose()
    }

    private _isReady: boolean = false

    private onReady(): void {
        console.log('onReady')
        this._isReady = true
        this.refresh(vscode.window.activeTextEditor, 'editor')
    }

    private async onActiveLinesChanged(e: LinesChangeEvent) {
        if (!this._isReady) {
            this.clear(e.editor)
            return
        }

        this.clear(e.editor)

        if (e.reason === 'content') {
            await this.refreshDebounced()
            return
        }

        if (e.selections !== undefined) {
            await this.refresh(e.editor, e.reason)
            return
        }
    }

    clear(editor: vscode.TextEditor | undefined) {
        if (editor) {
            editor.setDecorations(this._cwInlineHintDecorator.cwLineHintDecoration, [])
        }
    }

    private refreshDebounced = debounce(() => {
        this.refresh(vscode.window.activeTextEditor, 'content')
    }, 250)

    private async refresh(editor: vscode.TextEditor | undefined, reason: 'selection' | 'content' | 'editor') {
        if (editor == null && this._editor == null) {
            return
        }

        const selections = this.lineTracker.selections
        if (editor == null || selections == null || !isTextEditor(editor)) {
            if (!selections) {
                console.log('selection is undefined')
            }
            this.clear(this._editor)
            return
        }

        if (this._editor !== editor) {
            // Clear any annotations on the previously active editor
            this.clear(this._editor)
            this._editor = editor
        }

        if (this._suspended) {
            this.clear(editor)
            return
        }

        // Make sure the editor hasn't died since the await above and that we are still on the same line(s)
        if (editor.document == null || !this.lineTracker.includes(selections)) {
            return
        }

        // if (cancellation.isCancellationRequested) return
        await this.updateDecorations(editor, selections, reason)
    }

    async updateDecorations(
        editor: vscode.TextEditor,
        lines: LineSelection[],
        reason: 'selection' | 'codewhisperer' | 'content' | 'editor'
    ) {
        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, maxSmallIntegerV8, lines[0].active, maxSmallIntegerV8)
        )

        console.log(`updateDecorations:   ${reason}`)
        const options = this._cwInlineHintDecorator.getInlineDecoration(reason === 'content') as
            | vscode.DecorationOptions
            | undefined
        if (!options) {
            return
        }

        options.range = range
        console.log(range)
        editor.setDecorations(this._cwInlineHintDecorator.cwLineHintDecoration, [options])
    }

    private setLineTracker(enabled: boolean) {
        if (enabled) {
            if (!this.lineTracker.subscribed(this)) {
                this.lineTracker.subscribe(
                    this,
                    this.lineTracker.onDidChangeActiveLines(this.onActiveLinesChanged, this)
                )
            }

            return
        }

        this.lineTracker.unsubscribe(this)
    }
}
