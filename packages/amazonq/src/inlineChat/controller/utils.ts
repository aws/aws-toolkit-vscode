/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'

/**
 * Expands the given selection to full line(s) in the document.
 * If the selection is partial, it will be extended to include the entire line(s).
 * @param document The current text document
 * @param selection The current selection
 * @returns A new Range that covers full line(s) of the selection
 */
export function expandSelectionToFullLines(document: vscode.TextDocument, selection: vscode.Selection): vscode.Range {
    const startLine = document.lineAt(selection.start.line)
    const endLine = document.lineAt(selection.end.line)
    return new vscode.Range(startLine.range.start, endLine.range.end)
}

/**
 * Fixes the end-of-file newline for the given editor. If the selection is at the end of the
 * last line of the document, this function Iinserts a newline character.
 * @param editor The VS Code text editor to fix
 */
export async function fixEofNewline(editor: vscode.TextEditor) {
    if (
        editor.selection.end.line === editor.document.lineCount - 1 &&
        editor.selection.end.character === editor.document.lineAt(editor.selection.end.line).text.length
    ) {
        await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.end, '\n')
        })
    }
}
