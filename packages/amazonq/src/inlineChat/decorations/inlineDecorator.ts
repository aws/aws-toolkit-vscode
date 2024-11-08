/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { InlineTask } from '../controller/inlineTask'

export interface Decorations {
    linesAdded: vscode.DecorationOptions[]
    linesRemoved: vscode.DecorationOptions[]
}

const removedTextDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    isWholeLine: true,
})

const AddedTextDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    isWholeLine: true,
})

export class InlineDecorator {
    public applyDecorations(task: InlineTask): void {
        const decorations = task.decorations
        if (!decorations) {
            return
        }
        const editors = vscode.window.visibleTextEditors.filter(
            (editor) => editor.document.uri.toString() === task.document.uri.toString()
        )
        for (const editor of editors) {
            editor.setDecorations(AddedTextDecorationType, decorations.linesAdded ?? [])
            editor.setDecorations(removedTextDecorationType, decorations.linesRemoved ?? [])
        }
    }
}
