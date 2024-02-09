/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LineSelection, LineTracker, LinesChangeEvent } from './lineTracker'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { RecommendationService, SuggestionActionEvent } from '../../service/recommendationService'
import { getIcon } from '../../../shared/icons'
import { AuthUtil } from '../../util/authUtil'
import { once } from './lineAnnotationController'

const gutterColored = 'aws-codewhisperer-editor-gutter'
const gutterWhite = 'aws-codewhisperer-editor-gutter-white'

export class EditorGutterController implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined

    readonly cwlineGutterDecoration = vscode.window.createTextEditorDecorationType({
        gutterIconPath: iconPathToUri(getIcon(gutterWhite)),
        isWholeLine: true,
    })

    readonly cwlineGutterDecorationColored = vscode.window.createTextEditorDecorationType({
        gutterIconPath: iconPathToUri(getIcon(gutterColored)),
        isWholeLine: true,
    })

    constructor(private readonly lineTracker: LineTracker, private readonly auth: AuthUtil) {
        this._disposable = vscode.Disposable.from(
            this.setCWInlineService(true),
            once(this.lineTracker.onReady)(this.onReady, this),
            this.auth.auth.onDidChangeConnectionState(async e => {
                if (e.state !== 'authenticating') {
                    this.refresh(vscode.window.activeTextEditor)
                }
            }),
            this.auth.secondaryAuth.onDidChangeActiveConnection(async () => {
                this.refresh(vscode.window.activeTextEditor)
            })
        )
        this.setLineTracker(true)
    }

    dispose() {
        this.lineTracker.unsubscribe(this)
        this._disposable.dispose()
    }

    private _isReady: boolean = false

    private onReady(): void {
        this._isReady = true
        this.refresh(vscode.window.activeTextEditor)
    }

    private onActiveLinesChanged(e: LinesChangeEvent) {
        if (!this._isReady) {
            return
        }

        if (e.selections !== undefined) {
            void this.refresh(e.editor)
            return
        }

        this.clear(e.editor)
    }

    private onSuggestionActionEvent(e: SuggestionActionEvent) {
        if (!this._isReady) {
            return
        }

        this.refresh(e.editor)
    }

    clear(editor: vscode.TextEditor | undefined) {
        if (this._editor && this._editor !== editor) {
            this.clearAnnotations(this._editor)
        }
        this.clearAnnotations(editor)
    }

    // TODO: does this really get called?
    private clearAnnotations(editor: vscode.TextEditor | undefined) {
        if (editor === undefined || (editor as any)._disposed === true) return

        editor.setDecorations(this.cwlineGutterDecoration, [])
        editor.setDecorations(this.cwlineGutterDecorationColored, [])
    }

    async refresh(editor: vscode.TextEditor | undefined) {
        if (!this.auth.isConnectionValid(false)) {
            this.clear(this._editor)
            return
        }

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
        await this.updateDecorations(editor, selections)
    }

    async updateDecorations(editor: vscode.TextEditor, lines: LineSelection[]) {
        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, lines[0].active, lines[0].active, lines[0].active)
        )
        const isCWRunning = RecommendationService.instance.isRunning
        if (isCWRunning) {
            editor.setDecorations(this.cwlineGutterDecoration, [])
            editor.setDecorations(this.cwlineGutterDecorationColored, [range])
        } else {
            editor.setDecorations(this.cwlineGutterDecoration, [range])
            editor.setDecorations(this.cwlineGutterDecorationColored, [])
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
            // can't use refresh because refresh, by design, should only be triggered when there is line selection change
            this.refresh(e.editor)
        })

        return disposable // TODO: InlineCompletionService should deal with unsubscribe/dispose otherwise there will be memory leak
    }
}

// TODO: better way to do this?
function iconPathToUri(iconPath: any): vscode.Uri | undefined {
    let result: vscode.Uri | undefined = undefined
    if (iconPath.dark) {
        if (iconPath.dark.Uri) {
            result = iconPath.dark.Uri
            return result
        }
    }

    if (iconPath.light) {
        if (iconPath.light.Uri) {
            result = iconPath.light.Uri
            return result
        }
    }

    if (iconPath.source) {
        result = iconPath.source
        return result
    }

    return result
}
