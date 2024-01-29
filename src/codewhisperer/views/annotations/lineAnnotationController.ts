/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LineSelection, LineTracker, LinesChangeEvent } from './lineTracker'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { RecommendationService, SuggestionActionEvent } from '../../service/recommendationService'
import { InlineDecorator } from './annotationUtils'

export class LineAnnotationController implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined
    private _suspended = false

    constructor(private readonly lineTracker: LineTracker, private readonly _cwInlineHintDecorator: InlineDecorator) {
        console.log(`initializing lineAnnaotationController`)
        this._disposable = vscode.Disposable.from()
        this.setLineTracker(true)
        this.setCWInlineService(true)
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

        if (e.selections !== undefined) {
            void this.refresh(e.editor)

            return
        }

        this.clear(e.editor)
    }

    private onSuggestionActionEvent(e: SuggestionActionEvent) {
        this.refresh(e.editor, 'codewhisperer')
    }

    clear(editor: vscode.TextEditor | undefined) {
        // this._cancellation?.cancel();
        if (this._editor !== editor && this._editor != null) {
            this.clearAnnotations(this._editor)
        }
        this.clearAnnotations(editor)
    }

    // TODO: does this really get called?
    private clearAnnotations(editor: vscode.TextEditor | undefined) {
        console.log(`clearing annotations`)
        if (editor === undefined || (editor as any)._disposed === true) return

        this._cwInlineHintDecorator.allDecorations.forEach(d => {
            editor.setDecorations(d, [])
        })
    }

    private async refresh(editor: vscode.TextEditor | undefined, reason: 'line' | 'codewhisperer' = 'line') {
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
            console.log('3333333333333333333')
            return
        }

        // if (cancellation.isCancellationRequested) return
        await this.updateDecorations(editor, selections, reason)
    }

    async updateDecorations(editor: vscode.TextEditor, lines: LineSelection[], reason: 'line' | 'codewhisperer') {
        console.log(`updateDecorations`)

        if (reason === 'line') {
            this._cwInlineHintDecorator.onLineChangeDecorations(editor, lines).forEach(e => {
                editor.setDecorations(e.decorationType, e.decorationOptions)
            })
        } else {
            this._cwInlineHintDecorator.onSuggestionActionDecorations(editor, lines).forEach(e => {
                editor.setDecorations(e.decorationType, e.decorationOptions)
            })
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
