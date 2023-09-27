/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { DefaultRedshiftClient } from '../../../shared/clients/redshiftClient'
import { RedshiftData } from 'aws-sdk'
import { RedshiftSchemaNode } from '../../../redshift/explorer/redshiftSchemaNode'
import { ConnectionParams, ConnectionType, RedshiftWarehouseType } from '../../../redshift/models/models'
import { RedshiftTableNode } from '../../../redshift/explorer/redshiftTableNode'
import { ListTablesResponse } from 'aws-sdk/clients/redshiftdata'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'

describe('RedshiftSchemaNode', function () {
    const sandbox = sinon.createSandbox()
    const mockRedshiftData: RedshiftData = <RedshiftData>{}
    const redshiftClient: DefaultRedshiftClient = new DefaultRedshiftClient(
        'us-east-1',
        async () => mockRedshiftData,
        undefined,
        undefined
    )
    const connectionParams = new ConnectionParams(
        ConnectionType.TempCreds,
        'testDb1',
        'warehouseId',
        RedshiftWarehouseType.PROVISIONED
    )
    let listTablesStub: sinon.SinonStub

    describe('getChildren', function () {
        beforeEach(function () {
            listTablesStub = sandbox.stub()
            mockRedshiftData.listTables = listTablesStub
        })

        afterEach(function () {
            sandbox.reset()
        })

        it('gets table nodes and filters out tables with pkey', async () => {
            listTablesStub.returns({
                promise: () =>
                    Promise.resolve({ Tables: [{ name: 'test' }, { name: 'test_pkey' }] } as ListTablesResponse),
            })
            const node = new RedshiftSchemaNode('testSchema', redshiftClient, connectionParams)
            const childNodes = await node.getChildren()
            assert.strictEqual(childNodes.length, 1)
            assert.strictEqual((childNodes[0] as RedshiftTableNode).tableName, 'test')
        })

        it('gets table nodes & adds load more node if there are more nodes to be loaded', async () => {
            listTablesStub.returns({
                promise: () =>
                    Promise.resolve({
                        Tables: [{ name: 'test' }, { name: 'test_pkey' }],
                        NextToken: 'next',
                    } as ListTablesResponse),
            })
            const node = new RedshiftSchemaNode('testSchema', redshiftClient, connectionParams)
            const childNodes = await node.getChildren()
            assert.strictEqual(childNodes.length, 2)
            assert.strictEqual((childNodes[0] as RedshiftTableNode).tableName, 'test')
            assert.ok(childNodes[1] instanceof MoreResultsNode)
        })

        it('shows error node when list table API errors out', async () => {
            listTablesStub.returns({ promise: () => Promise.reject('failed') })
            const node = new RedshiftSchemaNode('testSchema', redshiftClient, connectionParams)
            const childNodes = await node.getChildren()
            assert.strictEqual(childNodes.length, 1)
            assert.strictEqual(childNodes[0].contextValue, 'awsErrorNode')
        })
    })
})
