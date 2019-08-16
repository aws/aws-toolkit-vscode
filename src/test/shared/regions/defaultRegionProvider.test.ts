/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import {
    getRegionsFromEndpoints,
    getRegionsFromPartition,
    RawEndpoints,
    RawPartition
} from '../../../shared/regions/defaultRegionProvider'
import { RegionInfo } from '../../../shared/regions/regionInfo'

const sampleEndpoints: RawEndpoints = {
    partitions: [
        {
            partition: 'aws',
            regions: {
                region1: {
                    description: 'aws region one'
                },
                region2: {
                    description: 'aws region two'
                },
                region3: {
                    description: 'aws region three'
                }
            }
        },
        {
            partition: 'aws-cn',
            regions: {
                awscnregion1: {
                    description: 'aws-cn region one'
                }
            }
        },
        {
            partition: 'fake',
            regions: {
                fakeregion1: {
                    description: 'fake region one'
                }
            }
        }
    ]
}

describe('getRegionsFromPartition', async () => {
    it('pulls region data from partition', async () => {
        const partition = sampleEndpoints.partitions.filter(p => p.partition === 'aws')[0]
        const regions = getRegionsFromPartition(partition)

        assert.ok(regions, 'Expected to get regions')
        assert.strictEqual(regions.length, 3, 'Expected 3 regions')
        assertPartitionRegionsExist(partition, regions)
    })
})

describe('getRegionsFromEndpoints', async () => {
    it('returns expected regions', async () => {
        // TODO : Support other Partition regions : https://github.com/aws/aws-toolkit-vscode/issues/188
        const partition = sampleEndpoints.partitions.filter(p => p.partition === 'aws')[0]
        const regions = getRegionsFromEndpoints(sampleEndpoints)

        assert.ok(regions, 'Expected to get regions')
        assert.strictEqual(regions.length, 3, 'Expected 3 regions')
        assertPartitionRegionsExist(partition, regions)
    })
})

/**
 * Assert that all regions in expectedPartition exist in actualRegions
 */
function assertPartitionRegionsExist(expectedPartition: RawPartition, actualRegions: RegionInfo[]) {
    Object.keys(expectedPartition.regions).forEach(regionCode => {
        const expectedRegion = expectedPartition.regions[regionCode]
        const candidateRegions = actualRegions.filter(region => region.regionCode === regionCode)
        assert.strictEqual(candidateRegions.length, 1, `Region not found for ${regionCode}`)
        assert.strictEqual(
            candidateRegions[0].regionName,
            expectedRegion.description,
            `Unexpected Region name for ${regionCode}`
        )
    })
}
