/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { getRegionsFromPartition, RawPartition } from '../../../shared/regions/defaultRegionProvider'

describe('getRegionsFromPartition', async () => {
    it('pulls region data from partition', async () => {
        const partition: RawPartition = {
            partition: 'qwerty',
            regions: {
                region1: {
                    description: 'region one'
                },
                region2: {
                    description: 'region two'
                },
                region3: {
                    description: 'region three'
                },
            }
        }

        const regions = getRegionsFromPartition(partition)
        assert.ok(regions, 'Expected to get regions')
        assert.strictEqual(regions.length, 3, 'Expected 3 regions')
        regions.forEach(region => {
            assert.ok(partition.regions[region.regionCode], `Expected region for ${region.regionCode}`)
            assert.strictEqual(
                partition.regions[region.regionCode].description,
                region.regionName,
                'Region name mismatch'
            )
        })
    })
})
