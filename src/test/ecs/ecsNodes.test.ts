/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ECS } from 'aws-sdk'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { EcsClusterNode } from '../../ecs/explorer/ecsClusterNode'
import { EcsNode } from '../../ecs/explorer/ecsNode'
import { EcsClient } from '../../shared/clients/ecsClient'
import { instance, mock, when } from '../utilities/mockito'

describe('EcsNode', function () {
    const firstCluster: ECS.Cluster = { clusterArn: 'firstArn', clusterName: 'first-cluster-name' }
    const secondCluster: ECS.Cluster = { clusterArn: 'secondArn', clusterName: 'second-cluster-name' }

    let ecs: EcsClient

    function assertClusterNode(node: AWSTreeNodeBase, expectedCluster: ECS.Cluster): void {
        assert.ok(node instanceof EcsClusterNode, `Node ${node} should be a Cluster Node`)
        assert.deepStrictEqual((node as EcsClusterNode).cluster, expectedCluster)
    }

    beforeEach(function () {
        ecs = mock()
    })

    it('gets children', async function () {
        when(ecs.listClusters()).thenResolve(
            [firstCluster, secondCluster],
        )

        const node = new EcsNode(instance(ecs))
        const [firstBucketNode, secondBucketNode, ...otherNodes] = await node.getChildren()

        assertClusterNode(firstBucketNode, firstCluster)
        assertClusterNode(secondBucketNode, secondCluster)
        assert.strictEqual(otherNodes.length, 0)
    })
})
