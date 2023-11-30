/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Position, TextEditor, window } from 'vscode'

export class EditorContentController {
    public insertTextAtCursorPosition(
        text: string,
        trackCodeEdit: (editor: TextEditor, cursorStart: Position) => void
    ) {
        const editor = window.activeTextEditor
        if (editor) {
            const cursorStart = editor.selection.active
            editor
                .edit(editBuilder => {
                    editBuilder.insert(cursorStart, text)
                })
                .then(appliedEdits => {
                    if (appliedEdits) {
                        trackCodeEdit(editor, cursorStart)
                    }
                })
        }
    }
}
