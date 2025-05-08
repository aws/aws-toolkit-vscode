/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LineAnnotationController } from './lineAnnotationTracker'
import { globals } from 'aws-core-vscode/shared'

export class InlineLineAnnotationController {
    private enabled: boolean = true

    constructor(private readonly lineAnnotationController: LineAnnotationController) {
        globals.context.subscriptions.push(
            vscode.window.onDidChangeTextEditorSelection(async ({ selections, textEditor }) => {
                let showShow = false

                if (this.enabled) {
                    for (const selection of selections) {
                        if (selection.end.line === selection.start.line + 1 && selection.end.character === 0) {
                            // dont show if the selection is just a newline
                        } else if (selection.start.line !== selection.end.line) {
                            showShow = true
                            break
                        }
                    }
                }

                await this.setVisible(textEditor, showShow)
            }, this)
        )
    }

    private async setVisible(editor: vscode.TextEditor, visible: boolean) {
        let needsRefresh: boolean
        if (visible) {
            needsRefresh = await this.lineAnnotationController.tryShowInlineHint()
        } else {
            needsRefresh = await this.lineAnnotationController.tryHideInlineHint()
        }
        if (needsRefresh) {
            await this.lineAnnotationController.refresh(editor, 'codewhisperer')
        }
    }

    async hide(editor: vscode.TextEditor) {
        await this.setVisible(editor, false)
    }

    enable() {
        this.enabled = true
    }

    async disable(editor: vscode.TextEditor) {
        this.enabled = false
        await this.setVisible(editor, false)
    }
}
