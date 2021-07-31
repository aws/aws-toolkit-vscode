/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { instance, mock, when } from '../../utilities/mockito'
import { EcsClusterNode } from '../../../ecs/explorer/ecsClusterNode'
import { ECS } from 'aws-sdk'
import { EcsClient } from '../../../shared/clients/ecsClient'
import { EcsNode } from '../../../ecs/explorer/ecsNode'
import { EcsServiceNode } from '../../../ecs/explorer/ecsServiceNode'

describe('EcsClusterNode', function () {
    const name = 'cluster-name'
    const nextToken = 'nextToken'
    const cluster: ECS.Cluster = { clusterName: name, clusterArn: 'cluster-arn' }
    const service: ECS.Service = { serviceName: 'service-name', serviceArn: 'service-arn' }
    let ecs: EcsClient

    function assertClusterNode(node: LoadMoreNode): void {
        assert.ok(node instanceof EcsClusterNode, `Node ${node} should be a Cluster Node`)
        assert.deepStrictEqual((node as EcsClusterNode).cluster, cluster)
    }

    function assertServiceNode(node: AWSTreeNodeBase, expectedService: ECS.Service): void {
        assert.ok(node instanceof EcsServiceNode, `Node ${node} should be a Service Node`)
        assert.deepStrictEqual((node as EcsServiceNode).arn, expectedService.serviceArn)
    }

    function assertMoreResultsNode(node: AWSTreeNodeBase): void {
        assert.ok(node instanceof MoreResultsNode, `Node ${node} should be a More Results Node`)
        assertClusterNode((node as MoreResultsNode).parent)
    }

    beforeEach(function () {
        ecs = mock()
    })

    describe('getChildren', function () {
        it('gets children', async function () {
            when(ecs.listServices(cluster.clusterArn!, undefined)).thenResolve({
                resource: [service],
                nextToken: undefined,
            })

            const node = new EcsClusterNode(cluster, new EcsNode(instance(ecs)), instance(ecs))
            const [serviceNode, ...otherNodes] = await node.getChildren()

            assertServiceNode(serviceNode, service)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async function () {
            when(ecs.listServices(cluster.clusterArn!, undefined)).thenResolve({
                resource: [service],
                nextToken,
            })

            const node = new EcsClusterNode(cluster, new EcsNode(instance(ecs)), instance(ecs))
            const [serviceNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assertServiceNode(serviceNode, service)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
