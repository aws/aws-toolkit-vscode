/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon = require('sinon')
import assert = require('assert')
import { CellStatusBarItemProvider } from '../../../redshift/notebook/cellStatusBarItemProvider'
import * as vscode from 'vscode'

describe('CellStatusBarItemProvider', function () {
    let cell: any
    let token: any
    let cellStatusBarItemProvider: any

    beforeEach(() => {
        cell = {
            notebook: {
                metadata: {
                    connectionParams: {
                        warehouseIdentifier: 'TestWarehouse',
                    },
                },
            },
        }
        token = new vscode.CancellationTokenSource().token
        cellStatusBarItemProvider = new CellStatusBarItemProvider()
    })

    this.afterEach(() => {
        sinon.restore()
    })

    it('provides "Connect" status bar item when cell has no connectionParams', () => {
        const cell = { notebook: { metadata: { connectionParams: undefined } } }
        const expectedText = '$(notebook-state-error) Connect'
        const result = cellStatusBarItemProvider.provideCellStatusBarItems(cell, undefined)
        assert(Array.isArray(result))
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].text, expectedText)
    })

    it('provides status bar with success-icon and connection information', () => {
        const result = cellStatusBarItemProvider.provideCellStatusBarItems(cell, token)
        const expectedText = '$(notebook-state-success) Connected to TestWarehouse'
        const expectedCommand = {
            command: 'aws.redshift.notebookConnectClicked',
            arguments: [cell, cellStatusBarItemProvider.refreshCellStatusBar.bind(cellStatusBarItemProvider)],
        }
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].text, expectedText)
        assert.deepStrictEqual(result[0].command.command, expectedCommand.command)
    })

    it('fires onDidChangeCellStatusBarItems when refreshCellStatusBar is called', () => {
        const onDidChangeCellStatusBarItemsSpy = sinon.spy(
            cellStatusBarItemProvider._onDidChangeCellStatusBarItems,
            'fire'
        )
        cellStatusBarItemProvider.refreshCellStatusBar()
        assert.strictEqual(onDidChangeCellStatusBarItemsSpy.name, 'fire')
    })
})
