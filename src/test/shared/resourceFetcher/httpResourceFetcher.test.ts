/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { mock, when, instance } from 'ts-mockito'
import { HttpResourceFetcher, getPropertyFromJsonUrl } from '../../../shared/resourcefetcher/httpResourceFetcher'

describe('getPropertyFromJsonUrl', function () {
    let mockFetcher: HttpResourceFetcher
    const dummyUrl = 'url'
    const dummyProperty = 'property'

    beforeEach(function () {
        mockFetcher = mock()
    })

    it('undefined if resource is not present', async function () {
        when(mockFetcher.get()).thenResolve(undefined)
        assert.strictEqual(await getPropertyFromJsonUrl(dummyUrl, dummyProperty, instance(mockFetcher)), undefined)
    })

    it('undefined if resource is not JSON', async function () {
        when(mockFetcher.get()).thenResolve('foo')
        assert.strictEqual(await getPropertyFromJsonUrl(dummyUrl, dummyProperty, instance(mockFetcher)), undefined)
    })

    it('undefined if property is not present', async function () {
        when(mockFetcher.get()).thenResolve('{"foo": "bar"}')
        assert.strictEqual(await getPropertyFromJsonUrl(dummyUrl, dummyProperty, instance(mockFetcher)), undefined)
    })

    it('returns value if property is present', async function () {
        when(mockFetcher.get()).thenResolve('{"property": "111"}')
        const value = await getPropertyFromJsonUrl(dummyUrl, dummyProperty, instance(mockFetcher))
        assert.strictEqual(value, '111')
    })
})
