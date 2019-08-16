/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { DefaultEcsNode } from '../../../awsexplorer/nodes/ecsNode'
import { MockRegionNode } from './mockNodes'

// TODO: create test for getChildren() after mocking is introduced
describe('DefaultEcsNode', () => {

    // Validates we tagged the node correctly
    it('initializes name, tooltip, and initial children', async () => {

        const testNode = new DefaultEcsNode(
            new MockRegionNode(),
            () => { throw new Error('unused') }
        )

        assert.strictEqual(testNode.label, 'ECS')
        assert.strictEqual(testNode.tooltip, 'ECS')

        const children = await testNode.getChildren()

        assert.strictEqual(children[0].label, 'Clusters')
        assert.strictEqual(children[1].label, 'Task Definitions')
    })

})
