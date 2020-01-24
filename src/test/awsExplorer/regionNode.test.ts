/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { RegionNode } from '../../awsexplorer/regionNode'
import { SchemasNode } from '../../eventSchemas/explorer/schemasNode'
import { DEFAULT_TEST_REGION_CODE, DEFAULT_TEST_REGION_NAME, FakeRegionProvider } from '../utilities/fakeAwsContext'

describe('RegionNode', () => {
    const regionCode = DEFAULT_TEST_REGION_CODE
    const regionName = DEFAULT_TEST_REGION_NAME
    const testNode = new RegionNode({ regionCode, regionName }, new FakeRegionProvider())

    it('initializes name and tooltip', async () => {
        assert.strictEqual(testNode.label, regionName)
        assert.strictEqual(testNode.tooltip, `${regionName} [${regionCode}]`)
    })

    it('contains children', async () => {
        const childNodes = await testNode.getChildren()
        assert.ok(childNodes.length > 0, 'Expected region node to have child nodes')
    })

    it('does not have child nodes for services not available in a region', async () => {
        const regionProvider = new FakeRegionProvider()
        regionProvider.servicesNotInRegion.push('schemas')
        const regionNode = new RegionNode({ regionCode, regionName }, regionProvider)

        const childNodes = await regionNode.getChildren()
        assert.ok(
            childNodes.filter(node => node instanceof SchemasNode).length === 0,
            'Expected Schemas node to be absent from child nodes'
        )
    })
})
