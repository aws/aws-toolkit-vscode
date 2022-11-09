/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import {
    HttpResourceFetcher,
    getPropertyFromJsonUrl,
    getFromUrl,
} from '../../../shared/resourcefetcher/httpResourceFetcher'

describe('httpResourceFetcher', function () {
    let resourceFetcherStub: sinon.SinonStub
    const dummyUrl = 'url'

    beforeEach(function () {
        resourceFetcherStub = sinon.stub(HttpResourceFetcher.prototype, 'get')
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('getPropertyFromJsonUrl', function () {
        const dummyProperty = 'property'

        it('undefined if resource is not present', async function () {
            resourceFetcherStub.resolves(undefined)
            assert.strictEqual(await getPropertyFromJsonUrl(dummyUrl, dummyProperty), undefined)
        })

        it('undefined if resource is not JSON', async function () {
            resourceFetcherStub.resolves('foo')
            assert.strictEqual(await getPropertyFromJsonUrl(dummyUrl, dummyProperty), undefined)
        })

        it('undefined if property is not present', async function () {
            resourceFetcherStub.resolves('{"foo": "bar"}')
            assert.strictEqual(await getPropertyFromJsonUrl(dummyUrl, dummyProperty), undefined)
        })

        it('returns value if property is present', async function () {
            resourceFetcherStub.resolves('{"property": "111"}')
            const value = await getPropertyFromJsonUrl(dummyUrl, dummyProperty)
            assert.strictEqual(value, '111')
        })
    })

    describe('getFromUrl', function () {
        it('undefined if resource is not present', async function () {
            resourceFetcherStub.resolves(undefined)
            assert.strictEqual(await getFromUrl(dummyUrl), undefined)
        })

        it('contents if resource is present', async function () {
            const foo = '{"foo": "bar"}'
            resourceFetcherStub.resolves(foo)
            assert.strictEqual(await getFromUrl(dummyUrl), foo)
        })
    })
})
