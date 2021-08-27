/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'

import { instance, mock, when } from '../../utilities/mockito'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import { getTag } from '../../../shared/schema/schemas'

describe('getTag', function () {
    let mockFetcher: HttpResourceFetcher
    const dummyUrl = 'url'

    beforeEach(function () {
        mockFetcher = mock()
    })

    it('undefined if manifest is not present', async function () {
        when(mockFetcher.get()).thenResolve(undefined)
        assert.strictEqual(await getTag(dummyUrl, instance(mockFetcher)), undefined)
    })

    it('undefined if manifest is not JSON', async function () {
        when(mockFetcher.get()).thenResolve('foo')
        assert.strictEqual(await getTag(dummyUrl, instance(mockFetcher)), undefined)
    })

    it('undefined if no tag name is present', async function () {
        when(mockFetcher.get()).thenResolve('{"foo": "bar"}')
        assert.strictEqual(await getTag(dummyUrl, instance(mockFetcher)), undefined)
    })

    it('returns tag if a tag name is present', async function () {
        when(mockFetcher.get()).thenResolve('{"tag_name": "111"}')
        const tag = await getTag(dummyUrl, instance(mockFetcher))
        assert.strictEqual(tag, '111')
    })
})
