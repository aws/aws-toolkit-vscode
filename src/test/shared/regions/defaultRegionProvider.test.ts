/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import {
    DefaultRegionProvider,
    getRegionsFromEndpoints,
    getRegionsFromPartition
} from '../../../shared/regions/defaultRegionProvider'
import { EndpointsManifest, Partition } from '../../../shared/regions/endpointsManifest'
import { RegionInfo } from '../../../shared/regions/regionInfo'
import { ResourceFetcher } from '../../../shared/resourcefetcher/resourcefetcher'

const sampleEndpoints: EndpointsManifest = {
    partitions: [
        {
            partition: 'aws',
            partitionName: 'Standard',
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
            },
            services: {}
        },
        {
            partition: 'aws-cn',
            partitionName: 'China',
            regions: {
                awscnregion1: {
                    description: 'aws-cn region one'
                }
            },
            services: {}
        },
        {
            partition: 'fake',
            partitionName: 'Fake Region',
            regions: {
                fakeregion1: {
                    description: 'fake region one'
                }
            },
            services: {}
        }
    ]
}

describe('DefaultRegionProvider', async () => {
    class ResourceFetcherCounter implements ResourceFetcher {
        public timesCalled = 0

        public async get(): Promise<string> {
            this.timesCalled++

            return JSON.stringify(sampleEndpoints)
        }
    }

    it('returns region data', async () => {
        const resourceFetcher = new ResourceFetcherCounter()
        const regionProvider = new DefaultRegionProvider(resourceFetcher)

        const regions = await regionProvider.getRegionData()

        assert.strictEqual(regions.length, 3, 'Expected to retrieve three regions')
        assert.strictEqual(resourceFetcher.timesCalled, 1)
    })

    it('loads from the resource fetcher only once', async () => {
        const resourceFetcher = new ResourceFetcherCounter()
        const regionProvider = new DefaultRegionProvider(resourceFetcher)

        await regionProvider.getRegionData()
        await regionProvider.getRegionData()

        assert.strictEqual(resourceFetcher.timesCalled, 1)
    })
})

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
function assertPartitionRegionsExist(expectedPartition: Partition, actualRegions: RegionInfo[]) {
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
