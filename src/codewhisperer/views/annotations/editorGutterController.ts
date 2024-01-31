/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LineSelection, LineTracker, LinesChangeEvent } from './lineTracker'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { RecommendationService, SuggestionActionEvent } from '../../service/recommendationService'
import { InlineDecorator } from './annotationUtils'

const maxSmallIntegerV8 = 2 ** 30 // Max number that can be stored in V8's smis (small integers)

export class EditorGutterController implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined
    private _suspended = false

    constructor(private readonly lineTracker: LineTracker, private readonly _cwInlineHintDecorator: InlineDecorator) {
        this._disposable = vscode.Disposable.from(this.setCWInlineService(true))
        this.setLineTracker(true)
        this.onReady()
    }

    dispose() {
        this.lineTracker.unsubscribe(this)
        this._disposable.dispose()
    }

    private onReady(): void {
        this.refresh(vscode.window.activeTextEditor)
    }

    private onActiveLinesChanged(e: LinesChangeEvent) {
        if (e.selections !== undefined) {
            void this.refresh(e.editor, e.reason)
            return
        }

        this.clear(e.editor)
    }

    private onSuggestionActionEvent(e: SuggestionActionEvent) {
        this.refresh(e.editor, 'codewhisperer')
    }

    clear(editor: vscode.TextEditor | undefined) {
        if (this._editor && this._editor !== editor) {
            this.clearAnnotations(this._editor)
        }
        this.clearAnnotations(editor)
    }

    // TODO: does this really get called?
    private clearAnnotations(editor: vscode.TextEditor | undefined) {
        console.log(`clearing annotations`)
        if (editor === undefined || (editor as any)._disposed === true) return

        editor.setDecorations(this._cwInlineHintDecorator.cwlineGutterDecoration, [])
        editor.setDecorations(this._cwInlineHintDecorator.cwlineGutterDecorationColored, [])
    }

    private async refresh(
        editor: vscode.TextEditor | undefined,
        reason: 'selection' | 'codewhisperer' | 'content' | 'editor' = 'selection'
    ) {
        if (editor == null && this._editor == null) {
            return
        }

        const selections = this.lineTracker.selections
        if (editor == null || selections == null || !isTextEditor(editor)) {
            this.clear(this._editor)
            return
        }

        if (this._editor !== editor) {
            // Clear any annotations on the previously active editor
            this.clear(this._editor)
            this._editor = editor
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
        const isCWRunning = RecommendationService.instance.isRunning
        if (isCWRunning) {
            editor.setDecorations(this._cwInlineHintDecorator.cwlineGutterDecoration, [])
            editor.setDecorations(this._cwInlineHintDecorator.cwlineGutterDecorationColored, [range])
        } else {
            editor.setDecorations(this._cwInlineHintDecorator.cwlineGutterDecoration, [range])
            editor.setDecorations(this._cwInlineHintDecorator.cwlineGutterDecorationColored, [])
        }
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

    private setCWInlineService(enabled: boolean) {
        const disposable = RecommendationService.instance.suggestionActionEvent(e => {
            console.log(`receiving onSuggestionActionEvent -- refreshing editor decoration`)
            // can't use refresh because refresh, by design, should only be triggered when there is line selection change
            this.refresh(e.editor, 'codewhisperer')
        })

        return disposable // TODO: InlineCompletionService should deal with unsubscribe/dispose otherwise there will be memory leak
    }
}
