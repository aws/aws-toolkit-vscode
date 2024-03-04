/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon = require('sinon')
import { RedshiftDatabaseNode } from '../../../redshift/explorer/redshiftDatabaseNode'
import { RedshiftData } from 'aws-sdk'
import { DefaultRedshiftClient } from '../../../shared/clients/redshiftClient'
import { ConnectionParams, ConnectionType, RedshiftWarehouseType } from '../../../redshift/models/models'
import assert = require('assert')
import { RedshiftSchemaNode } from '../../../redshift/explorer/redshiftSchemaNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'

describe('RedshiftDatabaseNode', function () {
    const sandbox = sinon.createSandbox()
    const mockRedshiftData = <RedshiftData>{}
    const redshiftClient = new DefaultRedshiftClient('us-east-1', async () => mockRedshiftData, undefined, undefined)
    const connectionParams = new ConnectionParams(
        ConnectionType.TempCreds,
        'testDb1',
        'warehouseId',
        RedshiftWarehouseType.PROVISIONED
    )
    let listSchemasStub: sinon.SinonStub

    describe('getChildren', function () {
        beforeEach(function () {
            listSchemasStub = sandbox.stub()
            mockRedshiftData.listSchemas = listSchemasStub
        })

        afterEach(function () {
            sandbox.reset()
        })

        it('loads schemas successfully', async () => {
            const node = new RedshiftDatabaseNode('testDB1', redshiftClient, connectionParams)
            listSchemasStub.returns({ promise: () => Promise.resolve({ Schemas: ['schema1'] }) })
            const childNodes = await node.getChildren()
            verifyChildNodes(childNodes, false)
        })

        it('loads schemas and shows load more node when there are more schemas', async () => {
            const node = new RedshiftDatabaseNode('testDB1', redshiftClient, connectionParams)
            listSchemasStub.returns({ promise: () => Promise.resolve({ Schemas: ['schema1'], NextToken: 'next' }) })
            const childNodes = await node.getChildren()
            verifyChildNodes(childNodes, true)
        })

        it('shows error node when listSchema fails', async () => {
            const node = new RedshiftDatabaseNode('testDB1', redshiftClient, connectionParams)
            listSchemasStub.returns({ promise: () => Promise.reject('Failed') })
            const childNodes = await node.getChildren()
            assert.strictEqual(childNodes.length, 1)
            assert.strictEqual(childNodes[0].contextValue, 'awsErrorNode')
        })
    })
})

function verifyChildNodes(childNodes: AWSTreeNodeBase[], withLoadMore: boolean) {
    assert.strictEqual(childNodes.length, withLoadMore ? 2 : 1)
    assert.ok(childNodes[0] instanceof RedshiftSchemaNode)
    assert.strictEqual((childNodes[0] as RedshiftSchemaNode).schemaName, 'schema1')
    if (withLoadMore) {
        assert.ok(childNodes[1] instanceof MoreResultsNode)
    }
}
