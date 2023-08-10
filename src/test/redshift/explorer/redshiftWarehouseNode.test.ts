/* eslint-disable header/header */
/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon = require('sinon')
import { DefaultRedshiftClient } from '../../../shared/clients/redshiftClient'
import { ListDatabasesResponse } from 'aws-sdk/clients/redshiftdata'
import { ConnectionParams, ConnectionType, RedshiftWarehouseType } from '../../../redshift/models/models'
import { RedshiftWarehouseNode, StartButtonNode } from '../../../redshift/explorer/redshiftWarehouseNode'
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
    const startButtonNodes = childNodes.filter(node => node instanceof StartButtonNode)
    assert.strictEqual(startButtonNodes.length, 1)
    assert.ok(childNodes[0] instanceof StartButtonNode)
    const databaseNodes = childNodes.filter(node => node instanceof RedshiftDatabaseNode)
    assert.strictEqual(databaseNodes.length, databaseNodeCount)
    const loadMoreNodes = childNodes.filter(node => node instanceof MoreResultsNode)
    assert.strictEqual(loadMoreNodes.length, shouldHaveLoadMore ? 1 : 0)
}

describe('redshiftWarehouseNode', function () {
    describe('getChildren', function () {
        const sandbox = sinon.createSandbox()
        const expectedResponse = { Databases: ['testDb1'] } as ListDatabasesResponse
        const expectedResponseWithNextToken = { Databases: ['testDb1'], NextToken: 'next' } as ListDatabasesResponse
        const connectionParams = new ConnectionParams(
            ConnectionType.TemporaryUser,
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
        let connectionWizardStub: RedshiftNodeConnectionWizard
        let listDatabasesStub: sinon.SinonStub
        let warehouseNode: RedshiftWarehouseNode

        beforeEach(function () {
            listDatabasesStub = sandbox.stub()
            mockRedshiftData.listDatabases = listDatabasesStub
        })

        afterEach(function () {
            sandbox.reset()
        })

        it('gets databases for a warehouse and adds a start button', async () => {
            connectionWizardStub = { run: () => Promise.resolve(connectionParams) } as RedshiftNodeConnectionWizard
            warehouseNode = new RedshiftWarehouseNode(
                redshiftNode,
                resourceNode,
                RedshiftWarehouseType.PROVISIONED,
                connectionWizardStub
            )
            listDatabasesStub.returns({ promise: () => Promise.resolve(expectedResponse) })

            const childNodes = await warehouseNode.getChildren()

            verifyChildNodes(childNodes, 1, false)
        })

        it('gets databases for a warehouse, adds a start button and a load more button if there are more results', async () => {
            connectionWizardStub = { run: () => Promise.resolve(connectionParams) } as RedshiftNodeConnectionWizard
            warehouseNode = new RedshiftWarehouseNode(
                redshiftNode,
                resourceNode,
                RedshiftWarehouseType.PROVISIONED,
                connectionWizardStub
            )
            listDatabasesStub.returns({ promise: () => Promise.resolve(expectedResponseWithNextToken) })

            const childNodes = await warehouseNode.getChildren()

            verifyChildNodes(childNodes, 1, true)
        })

        it('shows a node with retry if user exits wizard', async () => {
            connectionWizardStub = { run: () => Promise.resolve(undefined) } as RedshiftNodeConnectionWizard
            warehouseNode = new RedshiftWarehouseNode(
                redshiftNode,
                resourceNode,
                RedshiftWarehouseType.PROVISIONED,
                connectionWizardStub
            )
            const childNodes = await warehouseNode.getChildren()
            assert.strictEqual(childNodes.length, 1)
            assert.ok(childNodes[0] instanceof AWSCommandTreeNode)
            const cmdTreeNode = childNodes[0] as AWSCommandTreeNode
            assert.strictEqual(cmdTreeNode.command?.command, 'aws.refreshAwsExplorerNode')
        })
    })
})
