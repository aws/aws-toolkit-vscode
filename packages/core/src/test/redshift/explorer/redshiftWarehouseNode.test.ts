/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon = require('sinon')
import { DefaultRedshiftClient } from '../../../shared/clients/redshiftClient'
import { ListDatabasesResponse } from 'aws-sdk/clients/redshiftdata'
import { ConnectionParams, ConnectionType, RedshiftWarehouseType } from '../../../redshift/models/models'
import { RedshiftWarehouseNode, CreateNotebookNode } from '../../../redshift/explorer/redshiftWarehouseNode'
import { RedshiftNode } from '../../../redshift/explorer/redshiftNode'
import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import * as assert from 'assert'
import { RedshiftDatabaseNode } from '../../../redshift/explorer/redshiftDatabaseNode'
import { AWSCommandTreeNode } from '../../../shared/treeview/nodes/awsCommandTreeNode'
import { RedshiftNodeConnectionWizard } from '../../../redshift/wizards/connectionWizard'
import RedshiftData = require('aws-sdk/clients/redshiftdata')
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'

function verifyChildNodes(childNodes: AWSTreeNodeBase[], databaseNodeCount: number, shouldHaveLoadMore: boolean) {
    assert.strictEqual(childNodes.length, databaseNodeCount + (shouldHaveLoadMore ? 1 : 0) + 1)
    const startButtonNodes = childNodes.filter(node => node instanceof CreateNotebookNode)
    assert.strictEqual(startButtonNodes.length, 1)
    assert.ok(childNodes[0] instanceof CreateNotebookNode)
    const databaseNodes = childNodes.filter(node => node instanceof RedshiftDatabaseNode)
    assert.strictEqual(databaseNodes.length, databaseNodeCount)
    const loadMoreNodes = childNodes.filter(node => node instanceof MoreResultsNode)
    assert.strictEqual(loadMoreNodes.length, shouldHaveLoadMore ? 1 : 0)
}

function verifyRetryNode(childNodes: AWSTreeNodeBase[]) {
    assert.strictEqual(childNodes.length, 1)
    assert.ok(childNodes[0] instanceof AWSCommandTreeNode)
    const cmdTreeNode = childNodes[0] as AWSCommandTreeNode
    assert.strictEqual(cmdTreeNode.command?.command, 'aws.refreshAwsExplorerNode')
}

describe('redshiftWarehouseNode', function () {
    describe('getChildren', function () {
        const sandbox = sinon.createSandbox()
        const expectedResponse = { Databases: ['testDb1'] } as ListDatabasesResponse
        const expectedResponseWithNextToken = { Databases: ['testDb1'], NextToken: 'next' } as ListDatabasesResponse
        const connectionParams = new ConnectionParams(
            ConnectionType.TempCreds,
            'testDb1',
            'warehouseId',
            RedshiftWarehouseType.PROVISIONED
        )
        const resourceNode = { arn: 'testARN', name: 'warehouseId' } as AWSResourceNode
        const mockRedshiftData = <RedshiftData>{}
        const redshiftClient = new DefaultRedshiftClient(
            'us-east-1',
            async r => Promise.resolve(mockRedshiftData),
            undefined,
            undefined
        )
        const redshiftNode = new RedshiftNode(redshiftClient)
        let listDatabasesStub: sinon.SinonStub
        let warehouseNode: RedshiftWarehouseNode
        let connectionWizardStub: sinon.SinonStub

        beforeEach(function () {
            listDatabasesStub = sandbox.stub()
            mockRedshiftData.listDatabases = listDatabasesStub
        })

        afterEach(function () {
            sandbox.reset()
            connectionWizardStub.restore()
        })
        it('gets databases for a warehouse and adds a start button', async () => {
            connectionWizardStub = sinon.stub(RedshiftNodeConnectionWizard.prototype, 'run').resolves(connectionParams)
            warehouseNode = new RedshiftWarehouseNode(redshiftNode, resourceNode, RedshiftWarehouseType.PROVISIONED)
            listDatabasesStub.returns({ promise: () => Promise.resolve(expectedResponse) })

            const childNodes = await warehouseNode.getChildren()

            verifyChildNodes(childNodes, 1, false)
        })

        it('gets databases for a warehouse, adds a start button and a load more button if there are more results', async () => {
            connectionWizardStub = sinon.stub(RedshiftNodeConnectionWizard.prototype, 'run').resolves(connectionParams)
            warehouseNode = new RedshiftWarehouseNode(redshiftNode, resourceNode, RedshiftWarehouseType.PROVISIONED)
            listDatabasesStub.returns({ promise: () => Promise.resolve(expectedResponseWithNextToken) })

            const childNodes = await warehouseNode.getChildren()

            verifyChildNodes(childNodes, 1, true)
        })

        it('shows a node with retry if user exits wizard', async () => {
            connectionWizardStub = sinon.stub(RedshiftNodeConnectionWizard.prototype, 'run').resolves(undefined)
            warehouseNode = new RedshiftWarehouseNode(redshiftNode, resourceNode, RedshiftWarehouseType.PROVISIONED)
            const childNodes = await warehouseNode.getChildren()
            verifyRetryNode(childNodes)
        })

        it('shows a node with retry if there is error fetching databases', async () => {
            connectionWizardStub = sinon.stub(RedshiftNodeConnectionWizard.prototype, 'run').resolves(connectionParams)
            warehouseNode = new RedshiftWarehouseNode(redshiftNode, resourceNode, RedshiftWarehouseType.PROVISIONED)
            listDatabasesStub.returns({ promise: () => Promise.reject('Failed') })
            const childNodes = await warehouseNode.getChildren()
            verifyRetryNode(childNodes)
        })
    })
})
