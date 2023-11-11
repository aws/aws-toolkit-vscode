/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Recommendation } from '../../../codewhisperer/models/model'

describe('Recommendation', function () {
    let sut: Recommendation

    it('should return Block if it has multi lines', function () {
        sut = new Recommendation({ content: 'test\n\n   \t\r\nanother test' })
        assert.strictEqual(sut.completionType, 'Block')

        sut = new Recommendation({ content: 'test\ntest\n' })
        assert.strictEqual(sut.completionType, 'Block')

        sut = new Recommendation({ content: '\n   \t\r\ntest\ntest' })
        assert.strictEqual(sut.completionType, 'Block')
    })

    it('should return Line given a single-line suggestion', function () {
        sut = new Recommendation({ content: 'test' })
        assert.strictEqual(sut.completionType, 'Line')

        sut = new Recommendation({ content: 'test\r\t   ' })
        assert.strictEqual(sut.completionType, 'Line')
    })

    it('should return Line given a multi-line completion but only one-lien of non-blank sequence', function () {
        sut = new Recommendation({ content: 'test\n\t' })
        assert.strictEqual(sut.completionType, 'Line')

        sut = new Recommendation({ content: 'test\n    ' })
        assert.strictEqual(sut.completionType, 'Line')

        sut = new Recommendation({ content: 'test\n\r' })
        assert.strictEqual(sut.completionType, 'Line')

        sut = new Recommendation({ content: '\n\n\n\ntest' })
        assert.strictEqual(sut.completionType, 'Line')
    })
})
