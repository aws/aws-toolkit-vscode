/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { DefaultEcsClusterServiceNode } from '../../../awsexplorer/nodes/ecsClusterServiceNode'
import { MockServicesNode } from './mockNodes'

describe('DefaultEcsClusterServiceNode', () => {

    it('creates a node with correct labeling', async () => {
        const arn = 'arn:aws:ecs:us-east-1:123456789012:service/sample-webapp'
        const name = 'sample-webapp'
        const testNode = new DefaultEcsClusterServiceNode(
            new MockServicesNode(),
            arn,
            (unused: string) => 'unused'
        )

        assert.strictEqual(testNode.arn, arn)
        assert.strictEqual(testNode.tooltip, arn)
        assert.strictEqual(testNode.label, name)
    })

    it('can update a node', async () => {
        const arn = 'arn:aws:ecs:us-east-1:123456789012:service/sample-webapp'
        const arn2 = 'arn:aws:ecs:us-east-1:123456789012:service/sample-webapp2'
        const name = 'sample-webapp'
        const name2 = 'sample-webapp2'
        const testNode = new DefaultEcsClusterServiceNode(
            new MockServicesNode(),
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

    it('creates a node with correct labeling with a more complicated arn', async () => {
        const arn = 'arn:aws:ecs:us-east-1:123456789012:service/my-cluster/sample-webapp'
        const name = 'sample-webapp'
        const testNode = new DefaultEcsClusterServiceNode(
            new MockServicesNode(),
            arn,
            (unused: string) => 'unused'
        )

        assert.strictEqual(testNode.arn, arn)
        assert.strictEqual(testNode.tooltip, arn)
        assert.strictEqual(testNode.label, name)
    })

})
