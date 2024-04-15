/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { randomUUID } from '../../common/crypto'

describe('crypto', function () {
    describe('randomUUID()', function () {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

        it('functions as normal', async function () {
            const result1 = randomUUID()
            const result2 = randomUUID()
            const result3 = randomUUID()
            assert(uuidPattern.test(result1))
            assert(uuidPattern.test(result2))
            assert(uuidPattern.test(result3))
            assert(result1 !== result2)
            assert(result2 !== result3)
        })

        it('test pattern fails on non-uuid', function () {
            assert(uuidPattern.test('not-a-uuid') === false)
        })
    })
})
