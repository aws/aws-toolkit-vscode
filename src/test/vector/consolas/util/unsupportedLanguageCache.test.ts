/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { UnsupportedLanguagesCache } from '../../../../vector/consolas/util/unsupportedLanguagesCache'
import { ConsolasConstants } from '../../../../vector/consolas/models/constants'

describe('unsupportedLanguageCache', function () {
    describe('UnsupportedLanguageCache', function () {
        beforeEach(function () {
            UnsupportedLanguagesCache.clear()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Language in cache within TTL will not expire ', function () {
            UnsupportedLanguagesCache.addUnsupportedProgrammingLanguage('go')
            UnsupportedLanguagesCache.addUnsupportedProgrammingLanguage('c')
            UnsupportedLanguagesCache.addUnsupportedProgrammingLanguage('cpp')
            assert.ok(UnsupportedLanguagesCache.isUnsupportedProgrammingLanguage('go'))
            assert.ok(UnsupportedLanguagesCache.isUnsupportedProgrammingLanguage('c'))
            assert.ok(UnsupportedLanguagesCache.isUnsupportedProgrammingLanguage('cpp'))
        })

        it('add language and then get cache', function () {
            sinon.stub(Date, 'now').returns(1643943590951)
            UnsupportedLanguagesCache.addUnsupportedProgrammingLanguage('go')
            UnsupportedLanguagesCache.addUnsupportedProgrammingLanguage('c')
            const cache = UnsupportedLanguagesCache.getCache()
            assert.deepStrictEqual(cache, {
                go: 1643943590951,
                c: 1643943590951,
            })
        })

        it('Language in cache > TTL will expire and gets removed from cache ', function () {
            UnsupportedLanguagesCache.addUnsupportedProgrammingLanguage('go')
            UnsupportedLanguagesCache.addUnsupportedProgrammingLanguage('c')
            const earlierTime =
                UnsupportedLanguagesCache.getCache()['go'] - ConsolasConstants.unsupportedLanguagesCacheTTL - 1000
            const dateStub = sinon.stub(Date, 'now').returns(earlierTime)
            UnsupportedLanguagesCache.addUnsupportedProgrammingLanguage('cpp')
            dateStub.restore()
            assert.ok(UnsupportedLanguagesCache.isUnsupportedProgrammingLanguage('go'))
            assert.ok(UnsupportedLanguagesCache.isUnsupportedProgrammingLanguage('c'))
            assert.ok(!UnsupportedLanguagesCache.isUnsupportedProgrammingLanguage('cpp'))
            const cache = UnsupportedLanguagesCache.getCache()
            assert.ok('go' in cache)
            assert.ok('c' in cache)
            assert.ok(!('cpp' in cache))
        })
    })
})
