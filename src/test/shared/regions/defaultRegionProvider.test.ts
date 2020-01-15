/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { DefaultRegionProvider } from '../../../shared/regions/defaultRegionProvider'
import { ResourceFetcher } from '../../../shared/resourcefetcher/resourcefetcher'

const sampleEndpoints = {
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
            }
        },
        {
            partition: 'aws-cn',
            partitionName: 'China',
            regions: {
                awscnregion1: {
                    description: 'aws-cn region one'
                }
            }
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
