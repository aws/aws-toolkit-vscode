/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { partition } from '../../../shared/utilities/tsUtils'
import assert from 'assert'

describe('partition', function () {
    it('should split the list according to predicate', function () {
        const items = [1, 2, 3, 4, 5, 6, 7, 8]
        const [even, odd] = partition(items, (i) => i % 2 === 0)
        assert.deepStrictEqual(even, [2, 4, 6, 8])
        assert.deepStrictEqual(odd, [1, 3, 5, 7])
    })
})
