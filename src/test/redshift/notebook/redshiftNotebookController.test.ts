/* eslint-disable header/header */
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable header/header */
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RedshiftNotebookController } from '../../../redshift/notebook/redshiftNotebookController'
import sinon = require('sinon')
import assert = require('assert')
import { DefaultRedshiftClient } from '../../../shared/clients/redshiftClient'

describe('RedshiftNotebookController', () => {
    let redshiftClientStub: DefaultRedshiftClient
    let notebookController: any
    let createNotebookControllerStub: any
    beforeEach(() => {
        redshiftClientStub = {
            executeQuery: sinon.stub(),
        }
        createNotebookControllerStub = sinon.stub(vscode.notebooks, 'createNotebookController')
        const controllerInstanceValue = {
            supportedLanguages: ['sql'],
            supportsExecutionOrder: false,
            executeHandler: undefined,
            dispose: sinon.stub,
        }
        createNotebookControllerStub.returns(controllerInstanceValue)
        notebookController = new RedshiftNotebookController(redshiftClientStub)
    })
    afterEach(() => {
        sinon.restore()
    })
    it('validating parameters of  a notebook controller instance', () => {
        assert.strictEqual(notebookController.id, 'aws-redshift-sql-notebook')
        assert.strictEqual(notebookController.label, 'Redshift SQL notebook')
        assert.deepStrictEqual(notebookController.supportedLanguages, ['sql'])
        assert.strictEqual(notebookController._executionOrder, 0)
    })

    it('should execute all cells', () => {
        const executeAllStub = sinon.stub(notebookController, '_doExecution')
        const mockcell = {
            document: {
                getText: () => 'select * from table;',
            },
        }
        const cells = [mockcell]
        notebookController._executeAll(cells, undefined, undefined)
        assert.strictEqual(executeAllStub.callCount, cells.length)
    })
    it('should execute a cell successfully', async () => {
        const executeCellStub = sinon.stub(notebookController, 'executeCell')
        executeCellStub.resolves(vscode.NotebookCellOutput)
        const cellMock: any = {
            metadata: {
                connectionParams: {
                    warehouseIdentifier: 'TestWarehouse',
                },
            },
            document: {
                getText: sinon.stub().returns('SELECT * FROM my_table'),
            },
        }
        const cellOutput = await executeCellStub(cellMock)
        assert.strictEqual(cellOutput.isNotebookCellOutput.length, 1)
    })
})
