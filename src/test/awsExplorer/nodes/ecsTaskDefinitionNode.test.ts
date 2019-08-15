/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { DefaultEcsTaskDefinitionNode } from '../../../awsexplorer/nodes/ecsTaskDefinitionNode'
import { MockTaskDefinitionsNode } from './mockNodes'

describe('DefaultEcsTaskDefinitionNode', () => {

    it('creates a node with correct labeling', async () => {
        const name = 'tookittotask'
        const testNode = new DefaultEcsTaskDefinitionNode(
            new MockTaskDefinitionsNode(),
            name,
            (unused: string) => 'unused'
        )

        assert.strictEqual(testNode.name, name)
        assert.strictEqual(testNode.tooltip, name)
        assert.strictEqual(testNode.label, name)
    })

    it('can update a node', async () => {
        const name = 'taskmaster'
        const name2 = 'taskmeister'
        const testNode = new DefaultEcsTaskDefinitionNode(
            new MockTaskDefinitionsNode(),
            name,
            (unused: string) => 'unused'
        )

        assert.strictEqual(testNode.name, name)
        assert.strictEqual(testNode.tooltip, name)
        assert.strictEqual(testNode.label, name)

        testNode.update(name2)

        assert.strictEqual(testNode.name, name2)
        assert.strictEqual(testNode.tooltip, name2)
        assert.strictEqual(testNode.label, name2)
    })
})
