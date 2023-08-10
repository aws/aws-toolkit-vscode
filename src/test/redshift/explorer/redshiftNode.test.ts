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

function success<T>(output?: T): Request<T, AWSError> {
    return {
        promise: () => Promise.resolve(output),
    } as Request<any, AWSError>
}

function getExpectedProvisionedResponse(withNextToken: boolean): ClustersMessage {
    const response = {
        Clusters: [{ ClusterNamespaceArn: 'testArn', ClusterIdentifier: 'testId' }] as ClusterList,
    } as ClustersMessage
    if (withNextToken) {
        response.Marker = 'next'
    }
    return response
}

function getExpectedServerlessResponse(withNextToken: boolean): ListWorkgroupsResponse {
    const response = {
        workgroups: [{ workgroupArn: 'testArn', workgroupName: 'testWorkgroup' }] as WorkgroupList,
    } as ListWorkgroupsResponse
    if (withNextToken) {
        response.nextToken = 'next'
    }
    return response
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
            assert.ok(childNodes.length === 2)
            const provisionedNode = childNodes.filter(
                childNode => (childNode as RedshiftWarehouseNode).warehouseType === RedshiftWarehouseType.PROVISIONED
            )
            const serverlessNode = childNodes.filter(
                childNode => (childNode as RedshiftWarehouseNode).warehouseType === RedshiftWarehouseType.SERVERLESS
            )
            assert.strictEqual(provisionedNode.length, 1)
            assert.strictEqual(serverlessNode.length, 1)
            assert.ok(describeClustersStub.calledOnce)
            assert.ok(listWorkgroupsStub.calledOnce)
        })

        it('gets both provisioned and serverless warehouses if results have been loaded but there are more results', async () => {
            describeClustersStub.returns(success(getExpectedProvisionedResponse(true)))
            listWorkgroupsStub.returns(success(getExpectedServerlessResponse(true)))
            const childNodes = await node.getChildren()
            assert.ok(childNodes.length === 3)
            const provisionedNode = childNodes.filter(
                childNode => (childNode as RedshiftWarehouseNode).warehouseType === RedshiftWarehouseType.PROVISIONED
            )
            const serverlessNode = childNodes.filter(
                childNode => (childNode as RedshiftWarehouseNode).warehouseType === RedshiftWarehouseType.SERVERLESS
            )
            const loadMoreNode = childNodes.filter(childNode => childNode instanceof MoreResultsNode)
            assert.strictEqual(provisionedNode.length, 1)
            assert.strictEqual(serverlessNode.length, 1)
            assert.strictEqual(loadMoreNode.length, 1)
            assert.ok(describeClustersStub.calledOnce)
            assert.ok(listWorkgroupsStub.calledOnce)
        })

        it('gets only provisioned warehouses if results have been loaded and there are only more provisioned warehouses', async () => {
            describeClustersStub.returns(success(getExpectedProvisionedResponse(true)))
            listWorkgroupsStub.returns(success(getExpectedServerlessResponse(false)))
            const childNodes = await node.getChildren()
            assert.strictEqual(childNodes.length, 3)
            await node.loadMoreChildren()
            const newChildNodes = await node.getChildren()
            assert.strictEqual(newChildNodes.length, 4)
            const provisionedNodes = newChildNodes.filter(
                childNode => (childNode as RedshiftWarehouseNode).warehouseType === RedshiftWarehouseType.PROVISIONED
            )
            assert.strictEqual(provisionedNodes.length, 2)
            assert.strictEqual(describeClustersStub.callCount, 2)
            assert.strictEqual(listWorkgroupsStub.callCount, 1)
        })

        it('gets only serverless warehouses if results have been loaded and there are only more serverless warehouses', async () => {
            describeClustersStub.returns(success(getExpectedProvisionedResponse(false)))
            listWorkgroupsStub.returns(success(getExpectedServerlessResponse(true)))
            const childNodes = await node.getChildren()
            assert.strictEqual(childNodes.length, 3)
            await node.loadMoreChildren()
            const newChildNodes = await node.getChildren()
            assert.strictEqual(newChildNodes.length, 4)
            const serverlessNodes = newChildNodes.filter(
                childNode => (childNode as RedshiftWarehouseNode).warehouseType === RedshiftWarehouseType.SERVERLESS
            )
            assert.strictEqual(serverlessNodes.length, 2)
            assert.strictEqual(describeClustersStub.callCount, 1)
            assert.strictEqual(listWorkgroupsStub.callCount, 2)
        })
    })
})
