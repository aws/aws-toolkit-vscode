/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { DefaultEcsClusterNode } from '../../../awsexplorer/nodes/ecsClusterNode'
import { MockClustersNode } from './mockNodes'

describe('DefaultEcsClusterNode', () => {

    it('creates a node with correct labeling', async () => {
        const arn = 'arn:aws:ecs:us-east-1:123456789012:cluster/my-cluster'
        const name = 'my-cluster'
        const testNode = new DefaultEcsClusterNode(
            new MockClustersNode(),
            arn,
            (unused: string) => 'unused'
        )

        assert.strictEqual(testNode.arn, arn)
        assert.strictEqual(testNode.tooltip, arn)
        assert.strictEqual(testNode.label, name)
    })

    it('can update a node', async () => {
        const arn = 'arn:aws:ecs:us-east-1:123456789012:cluster/my-cluster'
        const arn2 = 'arn:aws:ecs:us-east-1:123456789012:cluster/my-cluster2'
        const name = 'my-cluster'
        const name2 = 'my-cluster2'
        const testNode = new DefaultEcsClusterNode(
            new MockClustersNode(),
            arn,
            (unused: string) => 'unused'
        )

        assert.strictEqual(testNode.arn, arn)
        assert.strictEqual(testNode.tooltip, arn)
        assert.strictEqual(testNode.label, name)

        testNode.update(arn2)

        assert.strictEqual(testNode.arn, arn2)
        assert.strictEqual(testNode.tooltip, arn2)
        assert.strictEqual(testNode.label, name2)
    })
})
