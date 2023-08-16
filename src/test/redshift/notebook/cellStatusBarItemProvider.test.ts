/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon = require('sinon')
import assert = require('assert')
import { CellStatusBarItemProvider } from '../../../redshift/notebook/cellStatusBarItemProvider'
import { NotebookCellStatusBarItem } from 'vscode'
import { getIcon } from '../../../shared/icons'

describe('CellStatusBarItemProvider', function () {
    let cell: any
    let token: any
    let cellStatusBarItemProvider: any

    beforeEach(() => {
        cell = {
            metadata: {
                connectionParams: {
                    warehouseIdentifier: 'TestWarehouse',
                },
            },
        }
        token = sinon.stub()
        cellStatusBarItemProvider = new CellStatusBarItemProvider()
    })

    it('should provide a connected status bar item', () => {
        const result = cellStatusBarItemProvider.provideCellStatusBarItems(cell, token)
        assert(Array.isArray(result))
        assert.strictEqual(result.length, 1)
        const statusBar = result[0]
        assert.ok(statusBar instanceof NotebookCellStatusBarItem)
        assert.strictEqual(statusBar.text, `${getIcon('vscode-notebook-state-success')} Connected to TestWarehouse`)
        const expectedCommand = {
            command: 'aws.redshift.connectClicked',
            arguments: [cell, cellStatusBarItemProvider.refreshCellStatusBar.bind(cellStatusBarItemProvider)],
        }
        assert.deepStrictEqual(statusBar.command.command, expectedCommand.command)
        assert.deepStrictEqual(statusBar.command.arguments[0], expectedCommand.arguments[0])
        assert.deepStrictEqual(statusBar.command.arguments[1].toString(), expectedCommand.arguments[1].toString())
    })

    it('should call onDidChangeCellStatusBarItems when refreshCellStatusBar is called', () => {
        const cellStatusBar = new CellStatusBarItemProvider()
        const refreshCellStatusBarSpy = sinon.spy(cellStatusBar, 'refreshCellStatusBar')
        const emitSpy = sinon.spy(cellStatusBar._onDidChangeCellStatusBarItems, 'fire')
        cellStatusBar.refreshCellStatusBar()
        assert(refreshCellStatusBarSpy.calledOnce)
        assert(emitSpy.calledOnce)
    })
})
