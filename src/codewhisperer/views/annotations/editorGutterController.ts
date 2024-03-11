/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LineSelection } from './lineTracker'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { RecommendationService, SuggestionActionEvent } from '../../service/recommendationService'
import { once } from './lineAnnotationController'
import { Container } from '../../service/serviceContainer'
import { RecommendationHandler } from '../../service/recommendationHandler'

export class EditorGutterController implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined

    private readonly cwLineHintDecoration: vscode.TextEditorDecorationType =
        vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 3em',
                contentText: 'CodeWhisperer is generating...',
                textDecoration: 'none',
                fontWeight: 'normal',
                fontStyle: 'normal',
                color: 'var(--vscode-editorCodeLens-foreground)',
            },
            rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
            isWholeLine: true,
        })

    constructor(private readonly container: Container) {
        this._disposable = vscode.Disposable.from(
            RecommendationService.instance.suggestionActionEvent(this.onSuggestionActionEvent, this),
            RecommendationHandler.instance.onDidReceiveRecommendation(this.onDidReceiveRecommendation, this),
            once(this.container._lineTracker.onReady)(this.onReady, this),
            this.container.auth.auth.onDidChangeConnectionState(async e => {
                if (e.state !== 'authenticating') {
                    this.refresh(vscode.window.activeTextEditor)
                }
            }),
            this.container.auth.secondaryAuth.onDidChangeActiveConnection(async () => {
                this.refresh(vscode.window.activeTextEditor)
            })
        )
    }

    dispose() {
        this.container._lineTracker.unsubscribe(this)
        this._disposable.dispose()
    }

    private _isReady: boolean = false

    private onReady(): void {
        this._isReady = true
        this.refresh(vscode.window.activeTextEditor)
    }

    private async onSuggestionActionEvent(e: SuggestionActionEvent) {
        if (!this._isReady) {
            return
        }

        this.clear(e.editor) // do we need this?
        await this.refresh(e.editor)
    }

    private async onDidReceiveRecommendation() {
        if (!this._isReady) {
            return
        }

        if (this._editor && this._editor === vscode.window.activeTextEditor) {
            await this.refresh(this._editor)
        }
    }

    clear(editor: vscode.TextEditor | undefined) {
        if (this._editor && this._editor !== editor) {
            this._editor.setDecorations(this.cwLineHintDecoration, [])
        }

        editor?.setDecorations(this.cwLineHintDecoration, [])
    }

    async refresh(editor: vscode.TextEditor | undefined) {
        if (!this.container.auth.isConnectionValid(false)) {
            this.clear(this._editor)
            return
        }

        if (!editor && !this._editor) {
            return
        }

        const selections = this.container._lineTracker.selections
        if (!editor || !selections || !isTextEditor(editor)) {
            this.clear(this._editor)
            return
        }

        if (this._editor !== editor) {
            // Clear any annotations on the previously active editor
            this.clear(this._editor)
            this._editor = editor
        }

        // Make sure the editor hasn't died since the await above and that we are still on the same line(s)
        if (!editor.document || !this.container._lineTracker.includes(selections)) {
            return
        }

        await this.updateDecorations(editor, selections, RecommendationService.instance.isRunning)
    }

    async updateDecorations(editor: vscode.TextEditor, lines: LineSelection[], flag: boolean) {
        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, lines[0].active, lines[0].active, lines[0].active)
        )

        if (flag) {
            editor.setDecorations(this.cwLineHintDecoration, [range])
        } else {
            editor.setDecorations(this.cwLineHintDecoration, [])
        }
    }
}
