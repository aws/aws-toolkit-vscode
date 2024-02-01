/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LineSelection, LineTracker, LinesChangeEvent } from './lineTracker'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { InlineDecorator } from './annotationUtils'
import { debounce2 } from '../../../shared/utilities/functionUtils'
import { AuthUtil } from '../../util/authUtil'

const maxSmallIntegerV8 = 2 ** 30 // Max number that can be stored in V8's smis (small integers)

export function once<T>(event: vscode.Event<T>): vscode.Event<T> {
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

    private _selections: LineSelection[] | undefined

    constructor(private readonly lineTracker: LineTracker, private readonly _cwInlineHintDecorator: InlineDecorator) {
        this._disposable = vscode.Disposable.from(once(this.lineTracker.onReady)(this.onReady, this))
        this.setLineTracker(true)
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
            return
        }

        this.clear(e.editor)

        if (e.reason === 'content') {
            await this.refreshDebounced2(e.editor, e.reason)
            return
        }

        if (e.selections !== undefined) {
            // await this.refresh(e.editor, e.reason)
            await this.refreshDebounced2(e.editor, e.reason)
            return
        }
    }

    clear(editor: vscode.TextEditor | undefined) {
        this._editor?.setDecorations(this._cwInlineHintDecorator.cwLineHintDecoration, [])
        if (editor) {
            editor.setDecorations(this._cwInlineHintDecorator.cwLineHintDecoration, [])
        }
    }

    readonly refreshDebounced2 = debounce2((editor, reason) => {
        this.refresh(editor, reason)
    }, 250)

    async refresh(editor: vscode.TextEditor | undefined, reason: 'selection' | 'content' | 'editor') {
        if (
            !AuthUtil.instance.isConnected() ||
            !AuthUtil.instance.isConnectionValid() ||
            AuthUtil.instance.isConnectionExpired()
        ) {
            this.clear(this._editor)
            return
        }

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
        await this.updateDecorations(editor, selections)
    }

    async updateDecorations(editor: vscode.TextEditor, lines: LineSelection[]) {
        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, maxSmallIntegerV8, lines[0].active, maxSmallIntegerV8)
        )

        const isSameline = this._selections ? isSameLine(this._selections[0], lines[0]) : false
        console.log(`isSameLine: ${isSameLine}`)
        const options = this._cwInlineHintDecorator.getInlineDecoration(isSameline) as
            | vscode.DecorationOptions
            | undefined
        if (!options) {
            return
        }

        options.range = range
        console.log(range)
        this._selections = lines
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

function isSameLine(s1: LineSelection, s2: LineSelection) {
    return s1.active === s2.active && s2.anchor === s2.anchor
}
