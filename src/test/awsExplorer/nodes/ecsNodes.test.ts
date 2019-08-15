/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { DefaultEcsNode } from '../../../awsexplorer/nodes/ecsNode'
import { RegionInfo } from '../../../shared/regions/regionInfo'

// TODO: create test for getChildren() after mocking is introduced
describe('DefaultRegionNode', () => {

    // Validates we tagged the node correctly
    it('initializes name and tooltip', async () => {

        const testNode = new DefaultEcsNode(
            {
                regionCode: 'us-weast-1',
                regionName: 'that says "west", Patrick',
                update: (info: RegionInfo) => undefined,
                getChildren: async () => []
            },
            () => { throw new Error('unused') }
        )

        assert.strictEqual(testNode.label, 'ECS')
        assert.strictEqual(testNode.tooltip, 'ECS')
    })

})
