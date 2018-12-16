/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { RegionNode } from '../../../lambda/explorer/regionNode'

// TODO: create test for getChildren() after mocking is introduced
describe('RegionNode', () => {

    const regionCode = 'us-east-1'
    const regionName = 'US East (N. Virginia)'

    // Validates we tagged the node correctly
    it('initializes name and tooltip', async () => {

        const testNode = new RegionNode(regionCode, regionName)

        assert.equal(testNode.getLabel(), regionName)
        assert.equal(testNode.getTooltip(), `${regionName} [${regionCode}]`)
    })

})
