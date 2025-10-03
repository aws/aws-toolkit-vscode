/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { createMockDocument } from 'aws-core-vscode/test'
import { convertCellContent, getNotebookContext } from '../../../../src/app/inline/notebookUtil'
import { CodeWhispererConstants } from 'aws-core-vscode/codewhisperer'

export function createNotebookCell(
    document: vscode.TextDocument = createMockDocument('def example():\n    return "test"'),
    kind: vscode.NotebookCellKind = vscode.NotebookCellKind.Code,
    notebook: vscode.NotebookDocument = {} as any,
    index: number = 0,
    outputs: vscode.NotebookCellOutput[] = [],
    metadata: { readonly [key: string]: any } = {},
    executionSummary?: vscode.NotebookCellExecutionSummary
): vscode.NotebookCell {
    return {
        document,
        kind,
        notebook,
        index,
        outputs,
        metadata,
        executionSummary,
    }
}

describe('Notebook Util', function () {
    describe('convertCellContent', function () {
        it('should return code cell content as-is', function () {
            const codeCell = createNotebookCell(
                createMockDocument('def example():\n    return "test"'),
                vscode.NotebookCellKind.Code
            )
            const result = convertCellContent(codeCell)
            assert.strictEqual(result, 'def example():\n    return "test"')
        })

        it('should convert markdown cell content to comments for Python', function () {
            const markdownCell = createNotebookCell(
                createMockDocument('# Heading\nSome text'),
                vscode.NotebookCellKind.Markup
            )
            const result = convertCellContent(markdownCell)
            assert.strictEqual(result, '# # Heading\n# Some text')
        })
    })

    describe('getNotebookContext', function () {
        it('should combine context from multiple cells', function () {
            const currentDoc = createMockDocument('cell2 content', 'b.ipynb')
            const notebook = {
                getCells: () => [
                    createNotebookCell(createMockDocument('cell1 content', 'a.ipynb'), vscode.NotebookCellKind.Code),
                    createNotebookCell(currentDoc, vscode.NotebookCellKind.Code),
                    createNotebookCell(createMockDocument('cell3 content', 'c.ipynb'), vscode.NotebookCellKind.Code),
                ],
            } as vscode.NotebookDocument

            const position = new vscode.Position(0, 5)

            const { caretLeftFileContext, caretRightFileContext } = getNotebookContext(notebook, currentDoc, position)

            assert.strictEqual(caretLeftFileContext, 'cell1 content\ncell2')
            assert.strictEqual(caretRightFileContext, ' content\ncell3 content')
        })

        it('should respect character limits', function () {
            const longContent = 'a'.repeat(10000)
            const notebook = {
                getCells: () => [createNotebookCell(createMockDocument(longContent), vscode.NotebookCellKind.Code)],
            } as vscode.NotebookDocument

            const currentDoc = createMockDocument(longContent)
            const position = new vscode.Position(0, 5000)

            const { caretLeftFileContext, caretRightFileContext } = getNotebookContext(notebook, currentDoc, position)

            assert.ok(caretLeftFileContext.length <= CodeWhispererConstants.charactersLimit)
            assert.ok(caretRightFileContext.length <= CodeWhispererConstants.charactersLimit)
        })
    })
})
