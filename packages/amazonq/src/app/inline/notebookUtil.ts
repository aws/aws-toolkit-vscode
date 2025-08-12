/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { CodeWhispererConstants, runtimeLanguageContext } from 'aws-core-vscode/codewhisperer'
import { InlineCompletionWithReferencesParams } from '@aws/language-server-runtimes/server-interface'

function getEnclosingNotebook(document: vscode.TextDocument): vscode.NotebookDocument | undefined {
    // For notebook cells, find the existing notebook with a cell that matches the current document.
    return vscode.workspace.notebookDocuments.find(
        (nb) => nb.notebookType === 'jupyter-notebook' && nb.getCells().some((cell) => cell.document === document)
    )
}

export function getNotebookContext(
    notebook: vscode.NotebookDocument,
    document: vscode.TextDocument,
    position: vscode.Position
) {
    // Expand the context for a cell inside of a noteboo with whatever text fits from the preceding and subsequent cells
    const allCells = notebook.getCells()
    const cellIndex = allCells.findIndex((cell) => cell.document === document)
    let caretLeftFileContext = ''
    let caretRightFileContext = ''

    if (cellIndex >= 0 && cellIndex < allCells.length) {
        // Add content from previous cells
        for (let i = 0; i < cellIndex; i++) {
            caretLeftFileContext += convertCellContent(allCells[i]) + '\n'
        }

        // Add content from current cell up to cursor
        caretLeftFileContext += allCells[cellIndex].document.getText(
            new vscode.Range(new vscode.Position(0, 0), position)
        )

        // Add content from cursor to end of current cell
        caretRightFileContext = allCells[cellIndex].document.getText(
            new vscode.Range(
                position,
                allCells[cellIndex].document.positionAt(allCells[cellIndex].document.getText().length)
            )
        )

        // Add content from following cells
        for (let i = cellIndex + 1; i < allCells.length; i++) {
            caretRightFileContext += '\n' + convertCellContent(allCells[i])
        }
    }
    caretLeftFileContext = caretLeftFileContext.slice(-CodeWhispererConstants.charactersLimit)
    caretRightFileContext = caretRightFileContext.slice(0, CodeWhispererConstants.charactersLimit)
    return { caretLeftFileContext, caretRightFileContext }
}

// Convert the markup cells into code with comments
export function convertCellContent(cell: vscode.NotebookCell) {
    const cellText = cell.document.getText()
    if (cell.kind === vscode.NotebookCellKind.Markup) {
        const commentPrefix = runtimeLanguageContext.getSingleLineCommentPrefix(
            runtimeLanguageContext.normalizeLanguage(cell.document.languageId) ?? cell.document.languageId
        )
        if (commentPrefix === '') {
            return cellText
        }
        return cell.document
            .getText()
            .split('\n')
            .map((line) => `${commentPrefix}${line}`)
            .join('\n')
    }
    return cellText
}

export function extractFileContextInNotebooks(
    document: vscode.TextDocument,
    position: vscode.Position
): InlineCompletionWithReferencesParams['fileContextOverride'] | undefined {
    let caretLeftFileContext = ''
    let caretRightFileContext = ''
    let languageName = runtimeLanguageContext.normalizeLanguage(document.languageId) ?? document.languageId
    if (document.uri.scheme === 'vscode-notebook-cell') {
        const notebook = getEnclosingNotebook(document)
        if (notebook) {
            ;({ caretLeftFileContext, caretRightFileContext } = getNotebookContext(notebook, document, position))
            return {
                leftFileContent: caretLeftFileContext,
                rightFileContent: caretRightFileContext,
                filename: document.fileName,
                fileUri: document.uri.toString(),
                programmingLanguage: languageName,
            }
        }
    }
    return undefined
}
