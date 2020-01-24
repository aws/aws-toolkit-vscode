/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { EndpointsProvider } from '../../../shared/regions/endpointsProvider'
import { ResourceFetcher } from '../../../shared/resourcefetcher/resourcefetcher'

describe('EndpointsProvider', async () => {
    const data1 = '{}'
    const data2 = JSON.stringify({
        partitions: [
            {
                partition: 'aws',
                partitionName: 'Standard'
            }
        ]
    })

    const fetcher1: ResourceFetcher = {
        get: async () => data1
    }

    const fetcher2: ResourceFetcher = {
        get: async () => data2
    }

    const undefinedFetcher: ResourceFetcher = {
        get: async () => undefined
    }

    it('loads from local fetcher', async () => {
        const provider = new EndpointsProvider(fetcher1, undefinedFetcher)
        await provider.load()

        assert.strictEqual(provider.getEndpoints()?.partitions.length, 0)
    })

    it('loads from remote fetcher', async () => {
        const provider = new EndpointsProvider(undefinedFetcher, fetcher2)
        await provider.load()

        assert.strictEqual(provider.getEndpoints()?.partitions.length, 1)
    })

    it('raises events after each fetcher', async () => {
        let timesCalled = 0
        const provider = new EndpointsProvider(fetcher1, fetcher2)
        provider.onEndpointsUpdated(e => {
            timesCalled++
        })
        await provider.load()

        assert.strictEqual(timesCalled, 2, 'Expected event to be raised twice')
    })

    it('does not raise an event if local fetcher returns nothing', async () => {
        let timesCalled = 0
        const provider = new EndpointsProvider(undefinedFetcher, fetcher2)
        provider.onEndpointsUpdated(e => {
            timesCalled++
        })
        await provider.load()

        assert.strictEqual(timesCalled, 1, 'Expected event to be raised once')
    })

    it('does not raise an event if remote fetcher returns nothing', async () => {
        let timesCalled = 0
        const provider = new EndpointsProvider(fetcher1, undefinedFetcher)
        provider.onEndpointsUpdated(e => {
            timesCalled++
        })
        await provider.load()

        assert.strictEqual(timesCalled, 1, 'Expected event to be raised once')
    })
})
