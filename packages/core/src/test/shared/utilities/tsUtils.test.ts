/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { tryFunctions } from '../../../shared/utilities/tsUtils'
import assert from 'assert'

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
