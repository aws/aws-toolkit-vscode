/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { getPrefixSuffixOverlap } from '../../../codewhisperer/util/commonUtil'

describe('commonUtil', function () {
    describe('getPrefixSuffixOverlap', function () {
        it('Should return correct overlap', async function () {
            assert.strictEqual(getPrefixSuffixOverlap('32rasdgvdsg', 'sg462ydfgbs'), `sg`)
            assert.strictEqual(getPrefixSuffixOverlap('32rasdgbreh', 'brehsega'), `breh`)
            assert.strictEqual(getPrefixSuffixOverlap('42y24hsd', '42y24hsdzqq23'), `42y24hsd`)
            assert.strictEqual(getPrefixSuffixOverlap('ge23yt1', 'ge23yt1'), `ge23yt1`)
            assert.strictEqual(getPrefixSuffixOverlap('1sgdbsfbwsergsa', 'a1sgdbsfbwsergs'), `a`)
            assert.strictEqual(getPrefixSuffixOverlap('xxa', 'xa'), `xa`)
        })

        it('Should return empty overlap for prefix suffix not matching cases', async function () {
            assert.strictEqual(getPrefixSuffixOverlap('1sgdbsfbwsergsa', '1sgdbsfbwsergs'), ``)
            assert.strictEqual(getPrefixSuffixOverlap('1sgdbsfbwsergsab', '1sgdbsfbwsergs'), ``)
            assert.strictEqual(getPrefixSuffixOverlap('2135t12', 'v2135t12'), ``)
            assert.strictEqual(getPrefixSuffixOverlap('2135t12', 'zv2135t12'), ``)
            assert.strictEqual(getPrefixSuffixOverlap('xa', 'xxa'), ``)
        })

        it('Should return empty overlap for empty string input', async function () {
            assert.strictEqual(getPrefixSuffixOverlap('ergwsghws', ''), ``)
            assert.strictEqual(getPrefixSuffixOverlap('', 'asfegw4eh'), ``)
        })
    })
})
