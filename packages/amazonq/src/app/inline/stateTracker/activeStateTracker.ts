/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { editorUtilities } from 'aws-core-vscode/shared'
import * as vscode from 'vscode'
import { LineSelection, LineTracker } from './lineTracker'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { cancellableDebounce } from 'aws-core-vscode/utils'

export class ActiveStateTracker implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable

    private readonly cwLineHintDecoration: vscode.TextEditorDecorationType =
        vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 3em',
                contentText: 'Amazon Q is generating...',
                textDecoration: 'none',
                fontWeight: 'normal',
                fontStyle: 'normal',
                color: 'var(--vscode-editorCodeLens-foreground)',
            },
            rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
            isWholeLine: true,
        })

    constructor(private readonly lineTracker: LineTracker) {
        this._disposable = vscode.Disposable.from(
            AuthUtil.instance.auth.onDidChangeConnectionState(async (e) => {
                if (e.state !== 'authenticating') {
                    this.hideGenerating()
                }
            }),
            AuthUtil.instance.secondaryAuth.onDidChangeActiveConnection(async () => {
                this.hideGenerating()
            })
        )
    }

    dispose() {
        this._disposable.dispose()
    }

    readonly refreshDebounced = cancellableDebounce(async () => {
        await this._refresh(true)
    }, 1000)

    async showGenerating(triggerType: vscode.InlineCompletionTriggerKind) {
        if (triggerType === vscode.InlineCompletionTriggerKind.Invoke) {
            // if user triggers on demand, immediately update the UI and cancel the previous debounced update if there is one
            this.refreshDebounced.cancel()
            await this._refresh(true)
        } else {
            await this.refreshDebounced.promise()
        }
    }

    async _refresh(shouldDisplay: boolean) {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }

        const selections = this.lineTracker.selections
        if (!editor || !selections || !editorUtilities.isTextEditor(editor)) {
            this.hideGenerating()
            return
        }

        if (!AuthUtil.instance.isConnectionValid()) {
            this.hideGenerating()
            return
        }

        await this.updateDecorations(editor, selections, shouldDisplay)
    }

    hideGenerating() {
        vscode.window.activeTextEditor?.setDecorations(this.cwLineHintDecoration, [])
    }

    async updateDecorations(editor: vscode.TextEditor, lines: LineSelection[], shouldDisplay: boolean) {
        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, lines[0].active, lines[0].active, lines[0].active)
        )

        if (shouldDisplay) {
            editor.setDecorations(this.cwLineHintDecoration, [range])
        } else {
            editor.setDecorations(this.cwLineHintDecoration, [])
        }
    }
}
