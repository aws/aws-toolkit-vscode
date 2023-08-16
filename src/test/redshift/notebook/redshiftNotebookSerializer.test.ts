/* eslint-disable header/header */
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
        assert(Array.isArray(notebookData.cells))
        assert.strictEqual(notebookData.cells.length, 0)
    })

    it('should correctly serialize a notebook', async () => {
        const cell1 = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'select * from table;', 'SQL')
        cell1.metadata = {
            connectionParams: {
                connectionType: 'Connection 1',
                database: 'abcd',
                username: 'xyz',
                warehouseIdentifier: 'test-cluster',
                warehouseType: 0,
            },
        }

        const notebookData = new vscode.NotebookData([cell1])
        const token = new vscode.CancellationTokenSource().token

        const serializedContents = await serializer.serializeNotebook(notebookData, token)
        const deserializeNotebookData = await serializer.deserializeNotebook(serializedContents, token)

        assert(Array.isArray(deserializeNotebookData.cells))
        assert.strictEqual(deserializeNotebookData.cells.length, 1)
        assert.deepStrictEqual(deserializeNotebookData.cells[0], cell1)
    })

    it('should correctly handle invalid JSOn during deserialization', async () => {
        const invalidContents = new TextEncoder().encode('data:{xyz:onk}')
        const token = new vscode.CancellationTokenSource().token
        const notebookData = await serializer.deserializeNotebook(invalidContents, token)
        assert(Array.isArray(notebookData.cells))
        assert.strictEqual(notebookData.cells.length, 0)
    })
})
