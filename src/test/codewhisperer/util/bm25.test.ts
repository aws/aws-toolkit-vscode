/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { BM25Okapi } from '../../../codewhisperer/util/supplementalContext/rankBm25'

describe('bm25', function () {
    it('simple case 1', function () {
        const query = 'windy London'
        const corpus = ['Hello there good man!', 'It is quite windy in London', 'How is the weather today?']

        const sut = new BM25Okapi(corpus)
        const actual = sut.score(query)

        assert.deepStrictEqual(actual, [
            {
                content: 'Hello there good man!',
                score: 0,
            },
            {
                content: 'It is quite windy in London',
                score: 0.937294722506405,
            },
            {
                content: 'How is the weather today?',
                score: 0,
            },
        ])

        assert.deepStrictEqual(sut.topN(query, 1), [
            {
                content: 'It is quite windy in London',
                score: 0.937294722506405,
            },
        ])
    })

    it('simple case 2', function () {
        const query = 'codewhisperer is a machine learning powered code generator'
        const corpus = [
            'codewhisperer goes GA at April 2023',
            'machine learning tool is the trending topic!!! :)',
            'codewhisperer is good =))))',
            'codewhisperer vs. copilot, which code generator better?',
            'copilot is a AI code generator too',
            'it is so amazing!!',
        ]

        const sut = new BM25Okapi(corpus)
        const actual = sut.score(query)

        assert.deepStrictEqual(actual, [
            {
                content: 'codewhisperer goes GA at April 2023',
                score: 0,
            },
            {
                content: 'machine learning tool is the trending topic!!! :)',
                score: 2.597224531416621,
            },
            {
                content: 'codewhisperer is good =))))',
                score: 0.3471790843435529,
            },
            {
                content: 'codewhisperer vs. copilot, which code generator better?',
                score: 1.063018436525109,
            },
            {
                content: 'copilot is a AI code generator too',
                score: 2.485359418462239,
            },
            {
                content: 'it is so amazing!!',
                score: 0.3154033715392277,
            },
        ])

        assert.deepStrictEqual(sut.topN(query, 1), [
            {
                content: 'machine learning tool is the trending topic!!! :)',
                score: 2.597224531416621,
            },
        ])

        assert.deepStrictEqual(sut.topN(query, 3), [
            {
                content: 'machine learning tool is the trending topic!!! :)',
                score: 2.597224531416621,
            },
            {
                content: 'copilot is a AI code generator too',
                score: 2.485359418462239,
            },
            {
                content: 'codewhisperer vs. copilot, which code generator better?',
                score: 1.063018436525109,
            },
        ])
    })
})
