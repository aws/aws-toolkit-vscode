/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { RegionNode } from '../../awsexplorer/regionNode'
import { RegionInfo } from '../../shared/regions/regionInfo'

describe('RegionNode', () => {
    const regionCode = 'us-east-1'
    const regionName = 'US East (N. Virginia)'
    const testNode = new RegionNode(new RegionInfo(regionCode, regionName))

    it('initializes name and tooltip', async () => {
        assert.strictEqual(testNode.label, regionName)
        assert.strictEqual(testNode.tooltip, `${regionName} [${regionCode}]`)
    })

    it('contains children', async () => {
        const childNodes = await testNode.getChildren()
        assert.ok(childNodes.length > 0, 'Expected region node to have child nodes')
    })
})
