/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LineSelection, LinesChangeEvent } from './lineTracker'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { RecommendationService, SuggestionActionEvent } from '../../service/recommendationService'
import { getIcon } from '../../../shared/icons'
import { once } from './lineAnnotationController'
import { Container } from '../../service/serviceContainer'
import { RecommendationHandler } from '../../service/recommendationHandler'

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

    readonly cwLineHintDecoration: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 3em',
            contentText: 'codewhisperer is generating...',
            textDecoration: 'none',
            fontWeight: 'normal',
            fontStyle: 'normal',
            color: '#8E8E8E',
        },
        rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
    })

    constructor(private readonly container: Container) {
        this._disposable = vscode.Disposable.from(
            this.subscribeSuggestionAction(true),
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
        this.subscribeLineTracker(true)
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

    async refresh(editor: vscode.TextEditor | undefined, flag?: boolean) {
        if (!this.container.auth.isConnectionValid(false)) {
            this.clear(this._editor)
            return
        }

        if (editor == null && this._editor == null) {
            return
        }

        const selections = this.container._lineTracker.selections
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
        if (editor.document == null || !this.container._lineTracker.includes(selections)) {
            return
        }

        if (flag !== undefined) {
            await this.updateDecorations(editor, selections, flag)
        } else {
            await this.updateDecorations(editor, selections, RecommendationService.instance.isRunning)
        }
    }

    async updateDecorations(editor: vscode.TextEditor, lines: LineSelection[], flag: boolean) {
        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, lines[0].active, lines[0].active, lines[0].active)
        )

        if (flag) {
            editor.setDecorations(this.cwlineGutterDecoration, [])
            editor.setDecorations(this.cwlineGutterDecorationColored, [range])

            if (this.container._lineAnnotationController._currentState.id === '4') {
                editor.setDecorations(this.cwLineHintDecoration, [range])
            }
        } else {
            editor.setDecorations(this.cwlineGutterDecoration, [range])
            editor.setDecorations(this.cwlineGutterDecorationColored, [])

            if (this.container._lineAnnotationController._currentState.id === '4') {
                editor.setDecorations(this.cwLineHintDecoration, [])
            }
        }
    }

    private subscribeLineTracker(enabled: boolean) {
        if (enabled) {
            if (!this.container._lineTracker.subscribed(this)) {
                this.container._lineTracker.subscribe(
                    this,
                    this.container._lineTracker.onDidChangeActiveLines(this.onActiveLinesChanged, this)
                )
            }

            return
        }

        this.container._lineTracker.unsubscribe(this)
    }

    private subscribeSuggestionAction(enabled: boolean) {
        const disposable = RecommendationService.instance.suggestionActionEvent(async e => {
            await this.refresh(e.editor)
        })

        const disposable2 = RecommendationHandler.instance.onDidReceiveRecommendation(async _ => {
            if (this._editor && this._editor === vscode.window.activeTextEditor) {
                await this.refresh(this._editor)
            }
        })

        return vscode.Disposable.from(disposable, disposable2) // TODO: InlineCompletionService should deal with unsubscribe/dispose otherwise there will be memory leak
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
