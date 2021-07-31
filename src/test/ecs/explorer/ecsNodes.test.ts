/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ECS } from 'aws-sdk'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { EcsClusterNode } from '../../../ecs/explorer/ecsClusterNode'
import { EcsNode } from '../../../ecs/explorer/ecsNode'
import { EcsClient } from '../../../shared/clients/ecsClient'
import { instance, mock, when } from '../../utilities/mockito'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'

describe('EcsNode', function () {
    const nextToken = 'nextToken'
    const firstCluster: ECS.Cluster = { clusterArn: 'firstArn', clusterName: 'first-cluster-name' }
    const secondCluster: ECS.Cluster = { clusterArn: 'secondArn', clusterName: 'second-cluster-name' }
    let ecs: EcsClient

    function assertClusterNode(node: AWSTreeNodeBase, expectedCluster: ECS.Cluster): void {
        assert.ok(node instanceof EcsClusterNode, `Node ${node} should be a Cluster Node`)
        assert.deepStrictEqual((node as EcsClusterNode).arn, expectedCluster.clusterArn)
    }

    function assertMoreResultsNode(node: AWSTreeNodeBase): void {
        assert.ok(node instanceof MoreResultsNode, `Node ${node} should be a More Results Node`)
    }

    beforeEach(function () {
        ecs = mock()
    })

    it('gets children', async function () {
        when(ecs.listClusters(undefined)).thenResolve({
            resource: [firstCluster, secondCluster],
            nextToken: undefined,
        })

        const node = new EcsNode(instance(ecs))
        const [firstClusterNode, secondClusterNode, ...otherNodes] = await node.getChildren()

        assertClusterNode(firstClusterNode, firstCluster)
        assertClusterNode(secondClusterNode, secondCluster)
        assert.strictEqual(otherNodes.length, 0)
    })

    it('gets children with node for loading more results', async function () {
        when(ecs.listClusters(undefined)).thenResolve({
            resource: [firstCluster],
            nextToken,
        })

        const node = new EcsNode(instance(ecs))
        const [firstClusterNode, moreResultsNode, ...otherNodes] = await node.getChildren()

        assertClusterNode(firstClusterNode, firstCluster)
        assertMoreResultsNode(moreResultsNode)
        assert.strictEqual(otherNodes.length, 0)
    })
})
