/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Position, TextEditor, window } from 'vscode'
import { getLogger } from '../../../shared/logger'

export class EditorContentController {
    /* *
     *  Insert the Amazon Q chat written code to the cursor position
     *  Add current intentation to the next few lines of the recommendation
     * @param text the raw text from Amazon Q chat
     * @param trackCodeEdit callback to track user edits
     */
    public insertTextAtCursorPosition(
        text: string,
        trackCodeEdit: (editor: TextEditor, cursorStart: Position) => void
    ) {
        const editor = window.activeTextEditor
        if (editor) {
            const cursorStart = editor.selection.active
            const indentRange = new vscode.Range(new vscode.Position(cursorStart.line, 0), cursorStart)
            // use the user editor intent if the position to the left of cursor is just space or tab
            // otherwise indent with empty space equal to the intent at this position
            let indent = editor.document.getText(indentRange)
            if (indent.trim().length !== 0) {
                indent = ' '.repeat(indent.length - indent.trimStart().length)
            }
            let textWithIndent = ''
            text.split('\n').forEach((line, index) => {
                if (index === 0) {
                    textWithIndent += line
                } else {
                    textWithIndent += '\n' + indent + line
                }
            })
            editor
                .edit((editBuilder) => {
                    editBuilder.insert(cursorStart, textWithIndent)
                })
                .then(
                    (appliedEdits) => {
                        if (appliedEdits) {
                            trackCodeEdit(editor, cursorStart)
                        }
                    },
                    (e) => {
                        getLogger().error('TextEditor.edit failed: %s', (e as Error).message)
                    }
                )
        }
    }
}
