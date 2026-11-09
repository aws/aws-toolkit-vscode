/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { tryFunctions } from '../../../shared/utilities/tsUtils'
import { partition } from '../../../shared/utilities/tsUtils'

describe('tryFunctions', function () {
    it('should return the result of the first function that returns', async function () {
        const f1 = () => Promise.reject('f1')
        const f2 = () => Promise.resolve('f2')
        const f3 = () => Promise.reject('f3')

        assert.strictEqual(await tryFunctions([f1, f2, f3]), 'f2')
    })

    it('if all reject, then should throw final error', async function () {
        const f1 = () => Promise.reject('f1')
        const f2 = () => Promise.reject('f2')
        const f3 = () => Promise.reject('f3')

        await assert.rejects(
            async () => await tryFunctions([f1, f2, f3]),
            (e) => e === 'f3'
        )
    })
})

describe('partition', function () {
    it('should split the list according to predicate', function () {
        const items = [1, 2, 3, 4, 5, 6, 7, 8]
        const [even, odd] = partition(items, (i) => i % 2 === 0)
        assert.deepStrictEqual(even, [2, 4, 6, 8])
        assert.deepStrictEqual(odd, [1, 3, 5, 7])
    })
})
