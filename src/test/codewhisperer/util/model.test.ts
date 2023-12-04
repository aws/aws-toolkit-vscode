/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { CompletionRecommendation } from '../../../codewhisperer/models/model'
import CodeWhispererUserClient from '../../../codewhisperer/client/codewhispereruserclient'
import CodeWhispererClient from '../../../codewhisperer/client/codewhispererclient'

describe('Recommendation', function () {
    let sut: CompletionRecommendation

    it('suggestion state is set to empty if content is of length 0', function () {
        sut = new CompletionRecommendation({ content: '' })
        assert.strictEqual(sut.suggestionState, 'Empty')
    })

    it('should return Block if it has multi lines', function () {
        sut = new CompletionRecommendation({ content: 'test\n\n   \t\r\nanother test' })
        assert.strictEqual(sut.completionType, 'Block')

        sut = new CompletionRecommendation({ content: 'test\ntest\n' })
        assert.strictEqual(sut.completionType, 'Block')

        sut = new CompletionRecommendation({ content: '\n   \t\r\ntest\ntest' })
        assert.strictEqual(sut.completionType, 'Block')
    })

    it('should return Line given a single-line suggestion', function () {
        sut = new CompletionRecommendation({ content: 'test' })
        assert.strictEqual(sut.completionType, 'Line')

        sut = new CompletionRecommendation({ content: 'test\r\t   ' })
        assert.strictEqual(sut.completionType, 'Line')
    })

    it('should return Line given a multi-line completion but only one-lien of non-blank sequence', function () {
        sut = new CompletionRecommendation({ content: 'test\n\t' })
        assert.strictEqual(sut.completionType, 'Line')

        sut = new CompletionRecommendation({ content: 'test\n    ' })
        assert.strictEqual(sut.completionType, 'Line')

        sut = new CompletionRecommendation({ content: 'test\n\r' })
        assert.strictEqual(sut.completionType, 'Line')

        sut = new CompletionRecommendation({ content: '\n\n\n\ntest' })
        assert.strictEqual(sut.completionType, 'Line')
    })

    it('should setup correctly with sdk Completion pojo', function () {
        const references: CodeWhispererUserClient.Reference[] = [
            {
                licenseName: 'license',
                repository: 'repo',
                url: 'https://amazon.com',
                recommendationContentSpan: {
                    start: 0,
                    end: 0,
                },
            },
        ]

        const imports: CodeWhispererUserClient.Import[] = [
            {
                statement: 'statement',
            },
        ]

        const completion: CodeWhispererUserClient.Completion = {
            content: 'foo',
            references: references,
            mostRelevantMissingImports: imports,
        }

        sut = new CompletionRecommendation(completion)

        assert.strictEqual(sut.content, 'foo')
        assert.strictEqual(sut.completionType, 'Line')
        assert.deepStrictEqual(sut.references, references)
        assert.deepStrictEqual(sut.mostRelevantMissingImports, imports)
        assert.deepStrictEqual(sut.cwRecommendation, completion)
    })

    it('should setup correctly with sdk Recommendation pojo', function () {
        const references: CodeWhispererClient.Reference[] = [
            {
                licenseName: 'license',
                repository: 'repo',
                url: 'https://amazon.com',
                recommendationContentSpan: {
                    start: 0,
                    end: 0,
                },
            },
        ]

        const imports: CodeWhispererClient.Import[] = [
            {
                statement: 'statement',
            },
        ]

        const completion: CodeWhispererClient.Recommendation = {
            content: 'foo',
            references: references,
            mostRelevantMissingImports: imports,
        }

        sut = new CompletionRecommendation(completion)

        assert.strictEqual(sut.content, 'foo')
        assert.strictEqual(sut.completionType, 'Line')
        assert.deepStrictEqual(sut.references, references)
        assert.deepStrictEqual(sut.mostRelevantMissingImports, imports)
        assert.deepStrictEqual(sut.cwRecommendation, completion)
    })
})
