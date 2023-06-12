/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { performBM25Scoring } from '../../../codewhisperer/util/supplementalContext/rankBm25'

describe('bm25', function () {
    describe('performBM25Scoring', function () {
        it('simple case 1', function () {
            const query = 'windy London'
            const corpus = ['Hello there good man!', 'It is quite windy in London', 'How is the weather today?']

            const actual = performBM25Scoring(corpus, query)

            assert.deepStrictEqual(actual, [
                {
                    index: 1,
                    score: 0.937294722506405,
                },
                {
                    index: 0,
                    score: 0,
                },
                {
                    index: 2,
                    score: 0,
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

            const actual = performBM25Scoring(corpus, query)

            assert.deepStrictEqual(actual, [
                {
                    index: 1,
                    score: 2.597224531416621,
                },
                {
                    index: 4,
                    score: 2.485359418462239,
                },
                {
                    index: 3,
                    score: 1.063018436525109,
                },
                {
                    index: 2,
                    score: 0.3471790843435529,
                },
                {
                    index: 5,
                    score: 0.3154033715392277,
                },
                {
                    index: 0,
                    score: 0,
                },
            ])
        })
    })
})
