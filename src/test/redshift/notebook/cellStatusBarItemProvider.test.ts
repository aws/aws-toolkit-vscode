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

    it('provides "Connect" status bar item when cell has no connectionParams', () => {
        const cell = { metadata: { connectionParams: undefined } }
        const expectedText = '$(notebook-state-error) Connect'
        const result = cellStatusBarItemProvider.provideCellStatusBarItems(cell, undefined)
        assert(Array.isArray(result))
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].text, expectedText)
    })

    it('provides a connected status bar item when cell has connectionParams', () => {
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
    })

    it('fires onDidChangeCellStatusBarItems when refreshCellStatusBar is called', () => {
        const onDidChangeCellStatusBarItemsSpy = sinon.spy(
            cellStatusBarItemProvider._onDidChangeCellStatusBarItems,
            'fire'
        )
        cellStatusBarItemProvider.refreshCellStatusBar()
        assert(onDidChangeCellStatusBarItemsSpy.calledOnce)
    })
})
