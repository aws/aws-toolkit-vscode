/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Container } from '../service/serviceContainer'
import { RecommendationHandler } from '../service/recommendationHandler'
import { cancellableDebounce } from '../../shared/utilities/functionUtils'

// TODO: uncomment
// import { LineSelection, LinesChangeEvent } from './lineTracker'
// import { isTextEditor } from '../../shared/utilities/editorUtilities'
// import { RecommendationService } from '../service/recommendationService'
// import { subscribeOnce } from '../../shared/utilities/vsCodeUtils'

export class ActiveStateController implements vscode.Disposable {
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
            // TODO: uncomment
            // RecommendationService.instance.suggestionActionEvent(this.onSuggestionActionEvent, this),
            RecommendationHandler.instance.onDidReceiveRecommendation(this.onDidReceiveRecommendation, this),
            // TODO: uncomment
            // this.container._lineTracker.onDidChangeActiveLines(this.onActiveLinesChanged, this),
            // TODO: uncomment
            // subscribeOnce(this.container._lineTracker.onReady)(this.onReady, this),
            this.container.auth.auth.onDidChangeConnectionState(async e => {
                if (e.state !== 'authenticating') {
                    this._refresh(vscode.window.activeTextEditor)
                }
            }),
            this.container.auth.secondaryAuth.onDidChangeActiveConnection(async () => {
                this._refresh(vscode.window.activeTextEditor)
            })
        )
    }

    dispose() {
        this._disposable.dispose()
    }

    private _isReady: boolean = false

    private onReady(): void {
        this._isReady = true
        this._refresh(vscode.window.activeTextEditor)
    }

    // TODO: uncomment
    // private async onSuggestionActionEvent(e: SuggestionActionEvent) {
    //     if (!this._isReady) {
    //         return
    //     }

    //     this.clear(e.editor) // do we need this?
    //     await this.refreshDebounced.promise(e.editor)
    // }

    private async onDidReceiveRecommendation() {
        if (!this._isReady) {
            return
        }

        if (this._editor && this._editor === vscode.window.activeTextEditor) {
            await this._refresh(this._editor, false)
        }
    }

    // TODO: uncomment
    // private async onActiveLinesChanged(e: LinesChangeEvent) {
    //     if (!this._isReady) {
    //         return
    //     }

    //     await this.refreshDebounced.promise(e.editor)
    // }

    clear(editor: vscode.TextEditor | undefined) {
        if (this._editor && this._editor !== editor) {
            this._editor.setDecorations(this.cwLineHintDecoration, [])
        }

        editor?.setDecorations(this.cwLineHintDecoration, [])
    }

    readonly refreshDebounced = cancellableDebounce((editor: vscode.TextEditor | undefined) => {
        this._refresh(editor)
    }, 500)

    // TODO: uncomment
    private async _refresh(editor: vscode.TextEditor | undefined, flag?: boolean) {
        // if (flag !== undefined) {
        //     this.refreshDebounced.cancel()
        // }
        // if (!this.container.auth.isConnectionValid(false)) {
        //     this.clear(this._editor)
        //     return
        // }
        // if (!editor && !this._editor) {
        //     return
        // }
        // const selections = this.container._lineTracker.selections
        // if (!editor || !selections || !isTextEditor(editor)) {
        //     this.clear(this._editor)
        //     return
        // }
        // if (this._editor !== editor) {
        //     // Clear any annotations on the previously active editor
        //     this.clear(this._editor)
        //     this._editor = editor
        // }
        // // Make sure the editor hasn't died since the await above and that we are still on the same line(s)
        // if (!editor.document || !this.container._lineTracker.includes(selections)) {
        //     return
        // }
        // if (flag !== undefined) {
        //     await this.updateDecorations(editor, selections, flag)
        // } else {
        //     await this.updateDecorations(editor, selections, RecommendationService.instance.isRunning)
        // }
    }

    // TODO: unncomment
    // async updateDecorations(editor: vscode.TextEditor, lines: LineSelection[], flag: boolean) {
    //     const range = editor.document.validateRange(
    //         new vscode.Range(lines[0].active, lines[0].active, lines[0].active, lines[0].active)
    //     )

    //     if (flag) {
    //         editor.setDecorations(this.cwLineHintDecoration, [range])
    //     } else {
    //         editor.setDecorations(this.cwLineHintDecoration, [])
    //     }
    // }
}
