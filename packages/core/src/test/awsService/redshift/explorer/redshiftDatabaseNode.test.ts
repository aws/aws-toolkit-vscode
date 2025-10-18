/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { mockClient } from 'aws-sdk-client-mock'
import { RedshiftDatabaseNode } from '../../../../awsService/redshift/explorer/redshiftDatabaseNode'
import { RedshiftDataClient, ListSchemasCommand } from '@aws-sdk/client-redshift-data'
import { DefaultRedshiftClient } from '../../../../shared/clients/redshiftClient'
import { ConnectionParams, ConnectionType, RedshiftWarehouseType } from '../../../../awsService/redshift/models/models'
import assert = require('assert')
import { RedshiftSchemaNode } from '../../../../awsService/redshift/explorer/redshiftSchemaNode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { MoreResultsNode } from '../../../../awsexplorer/moreResultsNode'

describe('RedshiftDatabaseNode', function () {
    const mockRedshiftData = mockClient(RedshiftDataClient)
    const redshiftClient = new DefaultRedshiftClient('us-east-1', () => mockRedshiftData as any, undefined, undefined)
    const connectionParams = new ConnectionParams(
        ConnectionType.TempCreds,
        'testDb1',
        'warehouseId',
        RedshiftWarehouseType.PROVISIONED
    )

    describe('getChildren', function () {
        afterEach(function () {
            mockRedshiftData.reset()
        })

        it('loads schemas successfully', async () => {
            const node = new RedshiftDatabaseNode('testDB1', redshiftClient, connectionParams)
            mockRedshiftData.on(ListSchemasCommand).resolves({ Schemas: ['schema1'] })
            const childNodes = await node.getChildren()
            verifyChildNodes(childNodes, false)
        })

        it('loads schemas and shows load more node when there are more schemas', async () => {
            const node = new RedshiftDatabaseNode('testDB1', redshiftClient, connectionParams)
            mockRedshiftData.on(ListSchemasCommand).resolves({ Schemas: ['schema1'], NextToken: 'next' })
            const childNodes = await node.getChildren()
            verifyChildNodes(childNodes, true)
        })

        it('shows error node when listSchema fails', async () => {
            const node = new RedshiftDatabaseNode('testDB1', redshiftClient, connectionParams)
            mockRedshiftData.on(ListSchemasCommand).rejects('Failed')
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
