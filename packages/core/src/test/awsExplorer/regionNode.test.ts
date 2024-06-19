/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { RegionNode } from '../../awsexplorer/regionNode'
import { SchemasNode } from '../../eventSchemas/explorer/schemasNode'
import {
    createTestRegionProvider,
    DEFAULT_TEST_REGION_CODE,
    DEFAULT_TEST_REGION_NAME,
} from '../shared/regions/testUtil'

describe('RegionNode', function () {
    let testNode: RegionNode

    beforeEach(function () {
        const regionProvider = createTestRegionProvider()
        testNode = new RegionNode({ id: regionCode, name: regionName }, regionProvider)
    })

    const regionCode = DEFAULT_TEST_REGION_CODE
    const regionName = DEFAULT_TEST_REGION_NAME

    it('initializes name and tooltip', async function () {
        assert.strictEqual(testNode.label, regionName)
        assert.strictEqual(testNode.tooltip, `${regionName} [${regionCode}]`)
    })

    it('contains children', async function () {
        const childNodes = await testNode.getChildren()
        assert.ok(childNodes.length > 0, 'Expected region node to have child nodes')
    })

    it('does not have child nodes for services not available in a region', async function () {
        const regionProvider = createTestRegionProvider()
        const regionNode = new RegionNode({ id: regionCode, name: regionName }, regionProvider)

        const childNodes = await regionNode.getChildren()
        assert.ok(
            childNodes.filter(node => node instanceof SchemasNode).length === 0,
            'Expected Schemas node to be absent from child nodes'
        )
    })
})
