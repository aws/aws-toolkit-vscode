/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import assert from 'assert'
import { loadEndpoints } from '../../../shared/regions/endpoints'

const sampleEndpoints = {
    partitions: [
        {
            partition: 'aws',
            partitionName: 'Standard',
            regions: {
                region1: {
                    description: 'aws region one',
                },
                region2: {
                    description: 'aws region two',
                },
                region3: {
                    description: 'aws region three',
                },
            },
            services: {},
        },
        {
            partition: 'aws-cn',
            partitionName: 'China',
            regions: {
                awscnregion1: {
                    description: 'aws-cn region one',
                },
            },
            services: {},
        },
        {
            partition: 'fake',
            partitionName: 'Fake Region',
            regions: {
                fakeregion1: {
                    description: 'fake region one',
                },
            },
            services: {
                foo: {
                    isRegionalized: true,
                    endpoints: {
                        someregion: {},
                    },
                },
            },
        },
    ],
}

describe('loadEndpoints', async function () {
    const json = JSON.stringify(sampleEndpoints)

    it('returns undefined for malformed json', async function () {
        const endpoints = loadEndpoints('{ foo: ')
        assert.strictEqual(endpoints, undefined)
    })

    it('returns an object for well-formed json', async function () {
        const endpoints = loadEndpoints(json)
        assert.ok(endpoints)
    })

    it('loads partitions', async function () {
        const endpoints = loadEndpoints(json)!
        assert.strictEqual(endpoints.partitions.length, 3, 'Unexpected amount of partitions loaded')
        const partition = endpoints.partitions[0]
        assert.strictEqual(partition.id, 'aws')
        assert.strictEqual(partition.name, 'Standard')
    })

    it('loads regions', async function () {
        const endpoints = loadEndpoints(json)!
        const partition = endpoints.partitions[0]
        const regions = partition.regions
        assert.strictEqual(regions.length, 3, 'Unexpected amount of regions loaded')
        const region = regions[1]
        assert.strictEqual(region.id, 'region2')
        assert.strictEqual(region.name, 'aws region two')
    })

    it('loads services', async function () {
        const endpoints = loadEndpoints(json)!
        const partition = endpoints.partitions[2]
        const services = partition.services
        assert.strictEqual(services.length, 1, 'Unexpected amount of services loaded')
        const service = services[0]
        assert.strictEqual(service.id, 'foo')
        assert.strictEqual(service.isRegionalized, true)
        assert.strictEqual(service.partitionEndpoint, undefined)
        assert.strictEqual(service.endpoints.length, 1)
    })
})
