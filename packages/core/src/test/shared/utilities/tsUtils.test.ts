/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { omitIfPresent } from '../../../shared/utilities/tsUtils'

describe('omitIfPresent', function () {
    it('returns a new object with value replace by [omitted]', function () {
        const obj = { a: 1, b: 2 }
        const result = omitIfPresent(obj, ['a'])
        assert.deepStrictEqual(result, { a: '[omitted]', b: 2 })
    })

    it('returns the original object if the key is not present', function () {
        const obj = { a: 1, b: 2 }
        const result = omitIfPresent(obj, ['c'])
        assert.deepStrictEqual(result, obj)
    })
})
