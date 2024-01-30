/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LineSelection, LineTracker, LinesChangeEvent } from './lineTracker'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { RecommendationService, SuggestionActionEvent } from '../../service/recommendationService'
import { InlineDecorator } from './annotationUtils'
import { debounce } from '../../../shared/utilities/functionUtils'

const maxSmallIntegerV8 = 2 ** 30 // Max number that can be stored in V8's smis (small integers)

export class LineAnnotationController implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined
    private _suspended = false

    constructor(private readonly lineTracker: LineTracker, private readonly _cwInlineHintDecorator: InlineDecorator) {
        console.log(`initializing lineAnnaotationController`)
        this._disposable = vscode.Disposable.from()
        this.setLineTracker(true)
        this.onReady()
    }

    dispose() {
        this.lineTracker.unsubscribe(this)
        this._disposable.dispose()
    }

    private onReady(): void {
        console.log(`onReady`)
        this.refresh(vscode.window.activeTextEditor)
    }

    private onActiveLinesChanged(e: LinesChangeEvent) {
        console.log(`lineAnnotationController: onActiveLinesChanged`)
        if (e.reason === 'content') {
            this.clear(e.editor)
            return
        }
        if (e.selections !== undefined) {
            this.refresh(e.editor)
            return
        }

        this.clear(e.editor)
    }

    clear(editor: vscode.TextEditor | undefined) {
        if (editor) {
            editor.setDecorations(this._cwInlineHintDecorator.cwLineHintDecoration, [])
        }
    }

    private async refresh(
        editor: vscode.TextEditor | undefined,
        reason: 'selection' | 'codewhisperer' | 'content' = 'selection'
    ) {
        if (editor == null && this._editor == null) {
            return
        }

        const selections = this.lineTracker.selections
        if (editor == null || selections == null || !isTextEditor(editor)) {
            this.clear(this._editor)
            console.log('222222222222222222222')
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
        reason: 'selection' | 'codewhisperer' | 'content'
    ) {
        console.log(`updateDecorations`)

        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, maxSmallIntegerV8, lines[0].active, maxSmallIntegerV8)
        )

        const options = this._cwInlineHintDecorator.getInlineDecoration() as vscode.DecorationOptions | undefined
        if (!options) {
            return
        }

        options.range = range

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
