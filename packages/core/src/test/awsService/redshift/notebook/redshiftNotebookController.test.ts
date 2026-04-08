/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RedshiftNotebookController } from '../../../../awsService/redshift/notebook/redshiftNotebookController'
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock'
import assert = require('assert')
import { DefaultRedshiftClient } from '../../../../shared/clients/redshiftClient'
import { RedshiftDataClient } from '@aws-sdk/client-redshift-data'
import sinon = require('sinon')

describe('RedshiftNotebookController', () => {
    const mockRedshiftData: AwsClientStub<RedshiftDataClient> = mockClient(RedshiftDataClient)
    // @ts-expect-error
    const redshiftClient = new DefaultRedshiftClient('us-east-1', () => mockRedshiftData, undefined, undefined)
    let notebookController: any
    let createNotebookControllerStub: any
    beforeEach(() => {
        createNotebookControllerStub = sinon.stub(vscode.notebooks, 'createNotebookController')
        const controllerInstanceValue = {
            supportedLanguages: ['sql'],
            supportsExecutionOrder: false,
            executeHandler: undefined,
            dispose: sinon.stub,
        }
        createNotebookControllerStub.returns(controllerInstanceValue)
        notebookController = new RedshiftNotebookController(redshiftClient)
    })
    afterEach(() => {
        mockRedshiftData.reset()
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
