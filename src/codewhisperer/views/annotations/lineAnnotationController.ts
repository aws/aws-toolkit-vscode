/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LineSelection, LineTracker, LinesChangeEvent } from './lineTracker'
import { InlineDecorator } from './annotationUtils'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { RecommendationService } from '../../service/recommendationService'

const annotationDecoration: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
        margin: '0 0 0 3em',
        textDecoration: 'none',
    },
    rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
})

export class LineAnnotationController implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined
    private _suspended = false
    private _cwInlineHintDecorator = new InlineDecorator()

    constructor(private readonly lineTracker: LineTracker) {
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

    clear(editor: vscode.TextEditor | undefined) {
        // this._cancellation?.cancel();
        if (this._editor !== editor && this._editor != null) {
            this.clearAnnotations(this._editor)
        }
        this.clearAnnotations(editor)
    }

    private clearAnnotations(editor: vscode.TextEditor | undefined) {
        if (editor === undefined || (editor as any)._disposed === true) return

        editor.setDecorations(annotationDecoration, [])
        // editor.setDecorations(, [])
    }

    private async refresh(editor: vscode.TextEditor | undefined) {
        if (editor == null && this._editor == null) {
            console.log('11111111111111111111')
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

        const timeout = 100

        // if (cancellation.isCancellationRequested) return
        await this.updateDecorations(editor, selections, timeout)
    }

    async updateDecorations(editor: vscode.TextEditor, lines: LineSelection[], timeout?: number) {
        console.log(`updateDecorations`)

        this._cwInlineHintDecorator.buildDecoration(editor, lines).forEach(e => {
            editor.setDecorations(e.decorationType, e.decorationOptions)
        })
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
            this.refresh(e.editor)
        })

        return disposable // TODO: InlineCompletionService should deal with unsubscribe/dispose otherwise there will be memory leak
    }
}
