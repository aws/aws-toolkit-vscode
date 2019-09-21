/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { DefaultRegionNode } from '../../awsexplorer/defaultRegionNode'
import { RegionInfo } from '../../shared/regions/regionInfo'

// TODO: create test for getChildren() after mocking is introduced
describe('DefaultRegionNode', () => {
    const regionCode = 'us-east-1'
    const regionName = 'US East (N. Virginia)'

    // Validates we tagged the node correctly
    it('initializes name and tooltip', async () => {
        const testNode = new DefaultRegionNode(new RegionInfo(regionCode, regionName))

        assert.strictEqual(testNode.label, regionName)
        assert.strictEqual(testNode.tooltip, `${regionName} [${regionCode}]`)
    })
})
