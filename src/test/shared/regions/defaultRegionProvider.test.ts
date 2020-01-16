/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { DefaultRegionProvider } from '../../../shared/regions/defaultRegionProvider'
import { EndpointsProvider } from '../../../shared/regions/endpointsProvider'
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
    const resourceFetcher: ResourceFetcher = {
        get: async () => {
            return JSON.stringify(sampleEndpoints)
        }
    }

    it('returns region data', async () => {
        const endpointsProvider = new EndpointsProvider(resourceFetcher, resourceFetcher)
        await endpointsProvider.load()

        const regionProvider = new DefaultRegionProvider(endpointsProvider)

        const regions = await regionProvider.getRegionData()

        assert.strictEqual(regions.length, 3, 'Expected to retrieve three regions')

        for (const expectedRegionId of ['region1', 'region2', 'region3']) {
            assert.ok(
                regions.some(r => r.regionCode === expectedRegionId),
                `${expectedRegionId} was missing from retrieved regions`
            )
        }
    })
})
