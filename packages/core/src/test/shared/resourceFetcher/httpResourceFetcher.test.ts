/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { HttpResourceFetcher, getPropertyFromJsonUrl } from '../../../shared/resourcefetcher/httpResourceFetcher'
import { stub } from '../../utilities/stubber'
import { createResponse } from '../../testUtil'

describe('getPropertyFromJsonUrl', function () {
    const dummyUrl = 'url'
    const dummyProperty = 'property'

    it('undefined if resource is not present', async function () {
        const mockFetcher = stub(HttpResourceFetcher)
        mockFetcher.get.resolves(undefined)
        assert.strictEqual(await getPropertyFromJsonUrl(dummyUrl, dummyProperty, mockFetcher), undefined)
    })

    it('undefined if resource is not JSON', async function () {
        const mockFetcher = stub(HttpResourceFetcher)
        mockFetcher.get.resolves(createResponse('foo'))
        assert.strictEqual(await getPropertyFromJsonUrl(dummyUrl, dummyProperty, mockFetcher), undefined)
    })

    it('undefined if property is not present', async function () {
        const mockFetcher = stub(HttpResourceFetcher)
        mockFetcher.get.resolves(createResponse('{"foo": "bar"}'))
        assert.strictEqual(await getPropertyFromJsonUrl(dummyUrl, dummyProperty, mockFetcher), undefined)
    })
    it('returns value if property is present', async function () {
        const mockFetcher = stub(HttpResourceFetcher)
        mockFetcher.get.resolves(createResponse('{"property": "111"}'))
        mockFetcher.getNewETagContent.resolves({ content: 'foo', eTag: '' })
        const value = await getPropertyFromJsonUrl(dummyUrl, dummyProperty, mockFetcher)
        assert.strictEqual(value, '111')
    })
})
