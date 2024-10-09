/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    JsonConfigFileNamingConvention,
    checkLeftContextKeywordsForJson,
    getPrefixSuffixOverlap,
} from 'aws-core-vscode/codewhisperer'

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

    describe('checkLeftContextKeywordsForJson', function () {
        it('Should return true for valid left context keywords', async function () {
            assert.strictEqual(
                checkLeftContextKeywordsForJson('foo.json', 'Create an S3 Bucket named CodeWhisperer', 'json'),
                true
            )
        })
        it('Should return false for invalid left context keywords', async function () {
            assert.strictEqual(
                checkLeftContextKeywordsForJson(
                    'foo.json',
                    'Create an S3 Bucket named CodeWhisperer in Cloudformation',
                    'json'
                ),
                false
            )
        })

        for (const jsonConfigFile of JsonConfigFileNamingConvention) {
            it(`should evalute by filename ${jsonConfigFile}`, function () {
                assert.strictEqual(checkLeftContextKeywordsForJson(jsonConfigFile, 'foo', 'json'), false)

                assert.strictEqual(checkLeftContextKeywordsForJson(jsonConfigFile.toUpperCase(), 'bar', 'json'), false)

                assert.strictEqual(checkLeftContextKeywordsForJson(jsonConfigFile.toUpperCase(), 'baz', 'json'), false)
            })

            const upperCaseFilename = jsonConfigFile.toUpperCase()
            it(`should evalute by filename and case insensitive ${upperCaseFilename}`, function () {
                assert.strictEqual(checkLeftContextKeywordsForJson(upperCaseFilename, 'foo', 'json'), false)

                assert.strictEqual(
                    checkLeftContextKeywordsForJson(upperCaseFilename.toUpperCase(), 'bar', 'json'),
                    false
                )

                assert.strictEqual(
                    checkLeftContextKeywordsForJson(upperCaseFilename.toUpperCase(), 'baz', 'json'),
                    false
                )
            })
        }
    })
})
