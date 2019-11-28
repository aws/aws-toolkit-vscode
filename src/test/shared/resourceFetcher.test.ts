/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { DefaultRegionProvider } from '../../shared/regions/defaultRegionProvider'
import { ResourceFetcher } from '../../shared/resourceFetcher'
import { ResourceLocation } from '../../shared/resourceLocation'
import { FakeExtensionContext } from '../fakeExtensionContext'

describe('ResourceFetcher', () => {
    class ResourceFetcherCounter implements ResourceFetcher {
        public timesCalled = 0

        public async getResource(resourceLocations: ResourceLocation[]): Promise<string> {
            this.timesCalled++

            return JSON.stringify({
                partitions: []
            })
        }
    }

    it('fetches something', async () => {
        const fetchCounter = new ResourceFetcherCounter()
        const context = new FakeExtensionContext()
        const regionProvider = new DefaultRegionProvider(context, fetchCounter)

        await regionProvider.getRegionData()

        assert.strictEqual(fetchCounter.timesCalled, 1)
    })

    it('fetches something the first time only', async () => {
        const fetchCounter = new ResourceFetcherCounter()
        const context = new FakeExtensionContext()
        const regionProvider = new DefaultRegionProvider(context, fetchCounter)

        await regionProvider.getRegionData()
        await regionProvider.getRegionData()

        assert.strictEqual(fetchCounter.timesCalled, 1)
    })
})
