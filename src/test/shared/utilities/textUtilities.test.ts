/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { getStringHash, removeAnsi, truncate } from '../../../shared/utilities/textUtilities'

describe('textUtil', async function () {
    it('truncate()', async function () {
        assert.deepStrictEqual(truncate('abc 123', 3), 'abc…')
        assert.deepStrictEqual(truncate('abc 123', -3), '…123')
        assert.deepStrictEqual(truncate('abc 123', 1), 'a…')
        assert.deepStrictEqual(truncate('abc 123', -1), '…3')
        assert.deepStrictEqual(truncate('abc 123', 0), '…')
        assert.deepStrictEqual(truncate('abc 123', 99), 'abc 123')
        assert.deepStrictEqual(truncate('abc 123', -99), 'abc 123')
    })
})

describe('removeAnsi', async function () {
    it('removes ansi code from text', async function () {
        assert.strictEqual(removeAnsi('\u001b[31mHello World'), 'Hello World')
    })

    it('text without ansi code remains as-is', async function () {
        const text = 'Hello World 123!'
        assert.strictEqual(removeAnsi(text), text)
    })
})

describe('getStringHash', async function () {
    it('produces a hash', async function () {
        assert.ok(getStringHash('hello'))
    })

    it('produces a different hash for different strings', async function () {
        assert.notStrictEqual(getStringHash('hello'), getStringHash('hello '))
    })
})
