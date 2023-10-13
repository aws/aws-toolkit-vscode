/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'

export class EditorContentController {
    public insertTextAtCursorPosition(text: string) {
        const editor = window.activeTextEditor
        if (editor) {
            editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, text)
            })
        }
    }
}
