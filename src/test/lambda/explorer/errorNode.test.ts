/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { DefaultRegionNode } from '../../../lambda/explorer/defaultRegionNode'
import { ErrorNode } from '../../../lambda/explorer/errorNode'
import { RegionInfo } from '../../../shared/regions/regionInfo'

describe('ErrorNode', () => {

    const regionCode = 'us-east-1'
    const regionName = 'US East (N. Virginia)'

    const regionNode = new DefaultRegionNode(
        new RegionInfo(regionCode, regionName),
        () => { throw new Error('unused') }
    )
    const error = new Error('error message')
    error.name = 'myMockError'

    // Validates we tagged the node correctly
    it('initializes label and tooltip', async () => {

        const testNode = new ErrorNode(regionNode, error, 'Error loading resources')

        assert.strictEqual(testNode.label, 'Error loading resources')
        assert.strictEqual(testNode.tooltip, `${error.name}:${error.message}`)
    })

    // Validates function nodes are leaves
    it('has no children', async () => {
        const testNode = new ErrorNode(regionNode, error, `Error loading resources (${error.name})`)

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 0)
    })

})
