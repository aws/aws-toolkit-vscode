/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { getRelativeDate, getStringHash, removeAnsi, truncate } from '../../../shared/utilities/textUtilities'

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

describe('getRelativeDate', function () {
    const now = new Date(2020, 2, 2, 2, 2, 2)
    it('produces readable dates', function () {
        const year = getRelativeDate(new Date(2019, 2, 2, 2, 2, 2), now)
        const month = getRelativeDate(new Date(2020, 1, 2, 2, 2, 2), now)
        const day = getRelativeDate(new Date(2020, 2, 1, 2, 2, 2), now)
        const hour = getRelativeDate(new Date(2020, 2, 2, 1, 2, 2), now)
        const minute = getRelativeDate(new Date(2020, 2, 2, 2, 1, 2), now)

        assert.strictEqual(year, 'a year ago')
        assert.strictEqual(month, 'a month ago')
        assert.strictEqual(day, 'a day ago')
        assert.strictEqual(hour, 'an hour ago')
        assert.strictEqual(minute, 'a minute ago')
    })
})
