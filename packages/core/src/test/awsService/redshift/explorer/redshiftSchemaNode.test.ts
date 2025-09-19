/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { mockClient, AwsClientStub } from 'aws-sdk-client-mock'
import * as assert from 'assert'
import { DefaultRedshiftClient } from '../../../../shared/clients/redshiftClient'
import { RedshiftDataClient, ListTablesCommand, ListTablesResponse } from '@aws-sdk/client-redshift-data'
import { RedshiftSchemaNode } from '../../../../awsService/redshift/explorer/redshiftSchemaNode'
import { ConnectionParams, ConnectionType, RedshiftWarehouseType } from '../../../../awsService/redshift/models/models'
import { RedshiftTableNode } from '../../../../awsService/redshift/explorer/redshiftTableNode'
import { MoreResultsNode } from '../../../../awsexplorer/moreResultsNode'

describe('RedshiftSchemaNode', function () {
    const mockRedshiftData: AwsClientStub<RedshiftDataClient> = mockClient(RedshiftDataClient)
    const redshiftClient: DefaultRedshiftClient = new DefaultRedshiftClient(
        'us-east-1',
        // @ts-expect-error
        () => mockRedshiftData,
        undefined,
        undefined
    )
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

        it('gets table nodes and filters out tables with pkey', async () => {
            mockRedshiftData
                .on(ListTablesCommand)
                .resolves({ Tables: [{ name: 'test' }, { name: 'test_pkey' }] } as ListTablesResponse)
            const node = new RedshiftSchemaNode('testSchema', redshiftClient, connectionParams)
            const childNodes = await node.getChildren()
            assert.strictEqual(childNodes.length, 1)
            assert.strictEqual((childNodes[0] as RedshiftTableNode).tableName, 'test')
        })

        it('gets table nodes & adds load more node if there are more nodes to be loaded', async () => {
            mockRedshiftData.on(ListTablesCommand).resolves({
                Tables: [{ name: 'test' }, { name: 'test_pkey' }],
                NextToken: 'next',
            } as ListTablesResponse)
            const node = new RedshiftSchemaNode('testSchema', redshiftClient, connectionParams)
            const childNodes = await node.getChildren()
            assert.strictEqual(childNodes.length, 2)
            assert.strictEqual((childNodes[0] as RedshiftTableNode).tableName, 'test')
            assert.ok(childNodes[1] instanceof MoreResultsNode)
        })

        it('shows error node when list table API errors out', async () => {
            mockRedshiftData.on(ListTablesCommand).rejects('failed')
            const node = new RedshiftSchemaNode('testSchema', redshiftClient, connectionParams)
            const childNodes = await node.getChildren()
            assert.strictEqual(childNodes.length, 1)
            assert.strictEqual(childNodes[0].contextValue, 'awsErrorNode')
        })
    })
})
