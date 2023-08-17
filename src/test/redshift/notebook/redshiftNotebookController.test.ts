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
    it('should create a notebook controller instance', () => {
        assert.strictEqual(notebookController.id, 'aws-redshift-sql-notebook')
        assert.strictEqual(notebookController.label, 'Redshift SQL notebook')
        assert.deepStrictEqual(notebookController.supportedLanguages, ['sql'])
        assert.strictEqual(notebookController._executionOrder, 0)
        assert.strictEqual(
            createNotebookControllerStub.calledOnceWithExactly(
                'aws-redshift-sql-notebook',
                'aws-redshift-sql-notebook',
                'sql'
            ),
            true
        )
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
        const notebookCell = {
            document: { getText: () => 'SELECT * FROM table_name;' },
        }
        const execution = {
            createNotebookCellExecution: sinon.stub(),
            start: sinon.stub(),
            end: sinon.stub(),
            replaceOutput: sinon.stub(),
        }
        execution.createNotebookCellExecution.returns(execution)
        notebookController._controller.createNotebookCellExecution = sinon.stub().returns(execution)
        await notebookController._doExecution(notebookCell)
        assert.strictEqual(executeCellStub.calledOnce, true)
        assert.strictEqual(execution.replaceOutput.calledOnce, true)
        assert.strictEqual(execution.end.calledOnce, true)
    })
    it('should handle cell execution error', async () => {
        const executeCellStub = sinon.stub(notebookController, 'executeCell')
        const notebookCell = {
            document: { getText: () => 'SELECT * FROM table_name;' },
        }
        const execution = {
            createNotebookCellExecution: sinon.stub(),
            start: sinon.stub(),
            end: sinon.stub(),
            replaceOutput: sinon.stub(),
        }
        execution.createNotebookCellExecution.returns(execution)
        notebookController._controller.createNotebookCellExecution = sinon.stub().returns(execution)
        const error = new Error('Execution failed')
        executeCellStub.rejects(error)
        await notebookController._doExecution(notebookCell)
        assert.strictEqual(executeCellStub.calledOnce, true)
        assert.strictEqual(execution.replaceOutput.calledOnce, true)
        assert.strictEqual(execution.end.calledOnce, true)
    })
})
