/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
// eslint-disable-next-line header/header
import sinon = require('sinon')
import { RedshiftNode } from '../../../redshift/explorer/redshiftNode'
import { DefaultRedshiftClient } from '../../../shared/clients/redshiftClient'
import { AWSError, Redshift, RedshiftServerless, Request } from 'aws-sdk'
import assert = require('assert')
import { RedshiftWarehouseNode } from '../../../redshift/explorer/redshiftWarehouseNode'
import { ClusterList, ClustersMessage } from 'aws-sdk/clients/redshift'
import { ListWorkgroupsResponse, WorkgroupList } from 'aws-sdk/clients/redshiftserverless'
import { RedshiftWarehouseType } from '../../../redshift/models/models'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'

function success<T>(output?: T): Request<T, AWSError> {
    return {
        promise: () => Promise.resolve(output),
    } as Request<any, AWSError>
}

function getExpectedProvisionedResponse(withNextToken: boolean): ClustersMessage {
    const response = {
        Clusters: [
            { ClusterNamespaceArn: 'testArn', ClusterIdentifier: 'testId', ClusterAvailabilityStatus: 'available' },
        ] as ClusterList,
    } as ClustersMessage
    if (withNextToken) {
        response.Marker = 'next'
    }
    return response
}

function getExpectedServerlessResponse(withNextToken: boolean): ListWorkgroupsResponse {
    const response = {
        workgroups: [{ workgroupArn: 'testArn', workgroupName: 'testWorkgroup', status: 'available' }] as WorkgroupList,
    } as ListWorkgroupsResponse
    if (withNextToken) {
        response.nextToken = 'next'
    }
    return response
}

function verifyChildNodeCounts(
    childNodes: AWSTreeNodeBase[],
    expectedProvisionedNodeCount: number,
    expectedServerlessNodeCount: number,
    expectedLoadMoreNodeCount: number
) {
    const provisionedNodes = childNodes.filter(
        childNode => (childNode as RedshiftWarehouseNode).warehouseType === RedshiftWarehouseType.PROVISIONED
    )
    const serverlessNodes = childNodes.filter(
        childNode => (childNode as RedshiftWarehouseNode).warehouseType === RedshiftWarehouseType.SERVERLESS
    )
    const loadMoreNodes = childNodes.filter(childNode => childNode instanceof MoreResultsNode)
    assert.strictEqual(
        childNodes.length,
        expectedProvisionedNodeCount + expectedServerlessNodeCount + expectedLoadMoreNodeCount,
        'Total node count mismatch'
    )
    assert.strictEqual(provisionedNodes.length, expectedProvisionedNodeCount, 'ProvisionedNode count mismatch')
    assert.strictEqual(serverlessNodes.length, expectedServerlessNodeCount, 'ServerlessNode count mismatch')
    assert.strictEqual(loadMoreNodes.length, expectedLoadMoreNodeCount, 'LoadMoreNode count mismatch')
}

describe('redshiftNode', function () {
    describe('getChildren', function () {
        let node: RedshiftNode
        let redshiftClient: DefaultRedshiftClient
        let mockRedshift: Redshift
        let mockRedshiftServerless: RedshiftServerless
        const sandbox: sinon.SinonSandbox = sinon.createSandbox()
        const describeClustersStub = sandbox.stub()
        const listWorkgroupsStub = sandbox.stub()

        function verifyStubCallCounts(describeClustersStubCallCount: number, listWorkgroupsStubCallCount: number) {
            assert.strictEqual(
                describeClustersStub.callCount,
                describeClustersStubCallCount,
                'DescribeClustersStub call count mismatch'
            )
            assert.strictEqual(
                listWorkgroupsStub.callCount,
                listWorkgroupsStubCallCount,
                'ListWorkgroupsStub call count mismatch'
            )
        }

        beforeEach(function () {
            mockRedshift = <Redshift>{}
            mockRedshiftServerless = <RedshiftServerless>{}
            redshiftClient = new DefaultRedshiftClient(
                'us-east-1',
                undefined,
                async r => Promise.resolve(mockRedshift),
                async r => Promise.resolve(mockRedshiftServerless)
            )
            mockRedshift.describeClusters = describeClustersStub
            mockRedshiftServerless.listWorkgroups = listWorkgroupsStub
            node = new RedshiftNode(redshiftClient)
        })

        afterEach(function () {
            sandbox.reset()
        })

        it('gets both provisioned and serverless warehouses when no results have been loaded', async () => {
            describeClustersStub.returns(success(getExpectedProvisionedResponse(false)))
            listWorkgroupsStub.returns(success(getExpectedServerlessResponse(false)))
            const childNodes = await node.getChildren()
            verifyChildNodeCounts(childNodes, 1, 1, 0)
            verifyStubCallCounts(1, 1)
        })

        it('gets both provisioned and serverless warehouses if results have been loaded but there are more results', async () => {
            describeClustersStub.returns(success(getExpectedProvisionedResponse(true)))
            listWorkgroupsStub.returns(success(getExpectedServerlessResponse(true)))
            const childNodes = await node.getChildren()
            verifyChildNodeCounts(childNodes, 1, 1, 1)
            verifyStubCallCounts(1, 1)
        })

        it('gets only provisioned warehouses if results have been loaded and there are only more provisioned warehouses', async () => {
            describeClustersStub.returns(success(getExpectedProvisionedResponse(true)))
            listWorkgroupsStub.returns(success(getExpectedServerlessResponse(false)))
            const childNodes = await node.getChildren()
            verifyChildNodeCounts(childNodes, 1, 1, 1)
            await node.loadMoreChildren()
            const newChildNodes = await node.getChildren()
            verifyChildNodeCounts(newChildNodes, 2, 1, 1)
            verifyStubCallCounts(2, 1)
        })

        it('gets only serverless warehouses if results have been loaded and there are only more serverless warehouses', async () => {
            describeClustersStub.returns(success(getExpectedProvisionedResponse(false)))
            listWorkgroupsStub.returns(success(getExpectedServerlessResponse(true)))
            const childNodes = await node.getChildren()
            verifyChildNodeCounts(childNodes, 1, 1, 1)
            await node.loadMoreChildren()
            const newChildNodes = await node.getChildren()
            verifyChildNodeCounts(newChildNodes, 1, 2, 1)
            verifyStubCallCounts(1, 2)
        })
    })
})
