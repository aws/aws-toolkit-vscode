/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { diffLines } from 'diff'

export class RealTimeDiffController {
    private decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(0, 255, 0, 0.2)',
        isWholeLine: true,
    })

    private deleteDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 0, 0, 0.2)',
        isWholeLine: true,
    })

    async applyIncrementalDiff(
        editor: vscode.TextEditor,
        originalContent: string,
        newContent: string,
        isPartial: boolean = false
    ) {
        const diffs = diffLines(originalContent, newContent)

        const addDecorations: vscode.DecorationOptions[] = []
        const deleteDecorations: vscode.DecorationOptions[] = []

        // Build incremental edits
        await editor.edit((editBuilder) => {
            let currentLine = 0

            for (const part of diffs) {
                const lines = part.value.split('\n').filter((l) => l !== '')

                if (part.removed) {
                    // For partial updates, don't delete yet, just mark
                    if (isPartial) {
                        const range = new vscode.Range(currentLine, 0, currentLine + lines.length, 0)
                        deleteDecorations.push({ range })
                    } else {
                        // Final update, actually delete
                        const range = new vscode.Range(currentLine, 0, currentLine + lines.length, 0)
                        editBuilder.delete(range)
                    }
                    currentLine += lines.length
                } else if (part.added) {
                    // Insert new content with decoration
                    const position = new vscode.Position(currentLine, 0)
                    editBuilder.insert(position, part.value)

                    // Highlight the added lines
                    for (let idx = 0; idx < lines.length; idx++) {
                        addDecorations.push({
                            range: new vscode.Range(currentLine + idx, 0, currentLine + idx + 1, 0),
                        })
                    }
                } else {
                    currentLine += lines.length
                }
            }
        })

        // Apply decorations after edit
        editor.setDecorations(this.decorationType, addDecorations)
        editor.setDecorations(this.deleteDecorationType, deleteDecorations)
    }

    dispose() {
        this.decorationType.dispose()
        this.deleteDecorationType.dispose()
    }
}
