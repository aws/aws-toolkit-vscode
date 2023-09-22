/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RedshiftNotebookSerializer } from '../../../redshift/notebook/redshiftNotebookSerializer'
import * as vscode from 'vscode'
import assert = require('assert')

describe('RedshiftNotebookSerializer', () => {
    let serializer: RedshiftNotebookSerializer

    beforeEach(() => {
        serializer = new RedshiftNotebookSerializer()
    })

    it('should correctly deserialize an empty notebook cell', async () => {
        const contents = new TextEncoder().encode(JSON.stringify({ cells: [] }))
        const token = new vscode.CancellationTokenSource().token
        const notebookData = await serializer.deserializeNotebook(contents, token)
        assert.deepStrictEqual(notebookData.cells, [])
    })

    it('should deserialize NotebookData correctly', async () => {
        const serializer = new RedshiftNotebookSerializer()
        const expectedMetadata = { Test: 'Meta' }
        const rawNotebookData = {
            cells: [
                {
                    kind: vscode.NotebookCellKind.Code,
                    language: 'sql',
                    value: 'select * from table',
                    metadata: expectedMetadata,
                },
            ],
        }
        const rawData = new TextEncoder().encode(JSON.stringify(rawNotebookData))
        const token = new vscode.CancellationTokenSource().token
        const result = await serializer.deserializeNotebook(rawData, token)
        assert.strictEqual(result.cells.length, 1)
        const actualResultCopy = JSON.parse(JSON.stringify(result.cells[0]))
        assert.deepStrictEqual(actualResultCopy, {
            kind: vscode.NotebookCellKind.Code,
            value: 'select * from table',
            languageId: 'sql',
            outputs: [],
        })
        assert.deepStrictEqual(result.metadata, expectedMetadata)
    })

    it('should serialize NotebookData correctly', async () => {
        const serializer = new RedshiftNotebookSerializer()
        const notebookData = new vscode.NotebookData([
            new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'select * from table;', 'SQL'),
        ])
        notebookData.metadata = { Test: 'Meta' }
        const token = new vscode.CancellationTokenSource().token
        const result = await serializer.serializeNotebook(notebookData, token)
        const decodedResult = new TextDecoder().decode(result)
        const expectedSerializedData =
            '{"cells":[{"kind":2,"language":"SQL","value":"select * from table;","metadata":{"Test":"Meta"}}]}'
        assert.strictEqual(decodedResult, expectedSerializedData)
    })

    it('should correctly handle invalid JSOn during deserialization', async () => {
        const invalidContents = new TextEncoder().encode('data:{xyz:onk}')
        const token = new vscode.CancellationTokenSource().token
        const notebookData = await serializer.deserializeNotebook(invalidContents, token)
        assert.deepStrictEqual(Array.from(notebookData.cells), [])
    })
})
