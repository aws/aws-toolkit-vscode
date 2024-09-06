/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { isUuid, randomUUID } from '../../shared/crypto'

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

    describe('isUuid()', function () {
        assert.equal(isUuid(''), false)
        assert.equal(isUuid('not-a-uuid'), false)
        assert.equal(isUuid('47fe01cf-f37a-4e7c-b971'), false)
        assert.equal(isUuid('47fe01cf_f37a_4e7c-b971-@10fe5897763'), false)
        // The '9' in '9e7c' must actually be between 1-5 based on the UUID spec: https://stackoverflow.com/a/38191104
        assert.equal(isUuid('47fe01cf-f37a-9e7c-b971-d10fe5897763'), false)
        assert.equal(isUuid(' 47fe01cf-f37a-4e7c-b971-d10fe5897763'), false) // leading whitespace
        assert.equal(isUuid('47fe01cf-f37a-4e7c-b971-d10fe5897763 '), false) // trailing whitespace
        assert.equal(isUuid('47fe01cf-f37a-4e7c-b971-d10fe5897763z'), false) // one extra character
        assert.equal(isUuid('47fe01cf-f37a-4e7c-b971-d10fe5897763 blah'), false) // trailing word

        assert.equal(isUuid('47fe01cf-f37a-4e7c-b971-d10fe5897763'), true)
        // The telemetry services indicates that per postel's law, uppercase is valid to pass in
        // as they will lowerCase when necessary.
        assert.equal(isUuid('47fe01cf-f37a-4e7c-b971-d10fe5897763'.toUpperCase()), true)
    })
})
