/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EndpointsProvider } from '../../../shared/regions/endpointsProvider'
import { ResourceFetcher } from '../../../shared/resourcefetcher/resourcefetcher'

describe('EndpointsProvider', async function () {
    const data1 = '{}'
    const data2 = JSON.stringify({
        partitions: [
            {
                partition: 'aws',
                partitionName: 'Standard',
            },
        ],
    })

    const fetcher1: ResourceFetcher = {
        get: async () => data1,
    }

    const fetcher2: ResourceFetcher = {
        get: async () => data2,
    }

    const undefinedFetcher: ResourceFetcher = {
        get: async () => undefined,
    }

    it('loads from local fetcher', async function () {
        const provider = new EndpointsProvider(fetcher1, undefinedFetcher)
        const endpoints = await provider.load()

        assert.strictEqual(endpoints.partitions.length, 0)
    })

    it('loads from remote fetcher', async function () {
        const provider = new EndpointsProvider(undefinedFetcher, fetcher2)
        const endpoints = await provider.load()

        assert.strictEqual(endpoints.partitions.length, 1)
    })

    it('prefers remote fetcher over local fetcher', async function () {
        const provider = new EndpointsProvider(fetcher1, fetcher2)
        const endpoints = await provider.load()

        assert.strictEqual(endpoints.partitions.length, 1)
    })
})
