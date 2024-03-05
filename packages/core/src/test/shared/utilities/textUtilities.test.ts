/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    getRelativeDate,
    getStringHash,
    removeAnsi,
    truncate,
    truncateProps,
    indent,
    formatLocalized,
    formatDateTimestamp,
    sanitizeFilename,
} from '../../../shared/utilities/textUtilities'
import globals from '../../../shared/extensionGlobals'

describe('textUtilities', async function () {
    it('truncateProps()', async function () {
        const testObj = {
            a: 34234234234,
            b: '123456789',
            c: new Date(2023, 1, 1),
            d: '123456789_abcdefg_ABCDEFG',
            e: {
                e1: [4, 3, 7],
                e2: 'loooooooooo \n nnnnnnnnnnn \n gggggggg \n string',
            },
            f: () => {
                throw Error()
            },
        }
        const expected = {
            ...testObj,
            e: {
                e1: [...testObj.e.e1],
                e2: testObj.e.e2,
            },
        }

        assert.deepStrictEqual(truncateProps(testObj, 25), expected)
        assert.deepStrictEqual(truncateProps(testObj, 3, ['b']), {
            ...expected,
            b: '123…',
        })
        // Assert that original object didn't change.
        assert.deepStrictEqual(truncateProps(testObj, 25), expected)

        assert.deepStrictEqual(truncateProps(testObj, 3, ['a', 'b', 'd', 'f']), {
            ...expected,
            b: '123…',
            d: '123…',
        })
    })

    it('truncate()', async function () {
        assert.deepStrictEqual(truncate('abc 123', 3), 'abc…')
        assert.deepStrictEqual(truncate('abc 123', -3), '…123')
        assert.deepStrictEqual(truncate('abc 123', 1), 'a…')
        assert.deepStrictEqual(truncate('abc 123', -1), '…3')
        assert.deepStrictEqual(truncate('abc 123', 0), '…')
        assert.deepStrictEqual(truncate('abc 123', 99), 'abc 123')
        assert.deepStrictEqual(truncate('abc 123', -99), 'abc 123')
    })

    it('indent()', async function () {
        assert.deepStrictEqual(indent('abc\n123', 2, false), '  abc\n  123')
        assert.deepStrictEqual(indent('abc\n 123\n', 2, false), '  abc\n   123\n')
        assert.deepStrictEqual(indent('abc\n 123\n', 2, true), '  abc\n  123\n')
        assert.deepStrictEqual(indent('   abc\n\n  \n123\nfoo\n', 4, false), '       abc\n\n      \n    123\n    foo\n')
        assert.deepStrictEqual(indent('   abc\n\n    \n123\nfoo\n', 4, true), '    abc\n\n    \n    123\n    foo\n')
    })

    it('formatLocalized()', async function () {
        const d = new globals.clock.Date(globals.clock.Date.UTC(2013, 11, 17, 3, 24, 0))
        assert.deepStrictEqual(formatLocalized(d, false), 'Dec 16, 2013 7:24:00 PM GMT-8')
        assert.deepStrictEqual(formatLocalized(d, true), 'Dec 16, 2013 7:24:00 PM PST')
    })

    it('formatDateTimestamp()', async function () {
        const d = new globals.clock.Date(globals.clock.Date.UTC(2013, 11, 17, 3, 24, 0))
        assert.deepStrictEqual(formatDateTimestamp(true, d), '2013-12-17T03:24:00.000-08:00')
        assert.deepStrictEqual(formatDateTimestamp(false, d), '2013-12-16T19:24:00.000+00:00')
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
    const now = new Date(2020, 4, 4, 4, 4, 4) // adjusts for clock skew modifier in `getRelativeDate` fn.
    it('produces readable dates', function () {
        const years = getRelativeDate(new Date(2018, 4, 4, 4, 4, 9), now)
        const year = getRelativeDate(new Date(2019, 4, 4, 4, 4, 9), now)
        const months = getRelativeDate(new Date(2019, 5, 4, 4, 4, 9), now)
        const month = getRelativeDate(new Date(2020, 3, 4, 4, 4, 9), now)
        const weeks = getRelativeDate(new Date(2020, 3, 9, 4, 4, 9), now)
        const week = getRelativeDate(new Date(2020, 3, 27, 4, 4, 9), now)
        const days = getRelativeDate(new Date(2020, 4, 2, 4, 4, 9), now)
        const day = getRelativeDate(new Date(2020, 4, 3, 4, 4, 9), now)
        const hour = getRelativeDate(new Date(2020, 4, 4, 3, 4, 9), now)
        const minute = getRelativeDate(new Date(2020, 4, 4, 4, 3, 9), now)

        assert.strictEqual(years, '2 years ago')
        assert.strictEqual(year, 'last year')
        assert.strictEqual(months, '11 months ago')
        assert.strictEqual(month, 'last month')
        assert.strictEqual(weeks, '4 weeks ago')
        assert.strictEqual(week, 'last week')
        assert.strictEqual(days, '2 days ago')
        assert.strictEqual(day, 'yesterday')
        assert.strictEqual(hour, '1 hour ago')
        assert.strictEqual(minute, '1 minute ago')
    })
})

describe('sanitizeFilename', function () {
    const cases: { input: string; output: string; case: string; replaceString?: string }[] = [
        { input: 'foo🤷', output: 'foo_', case: 'removes emojis' },
        { input: 'foo/zub', output: 'foo_zub', case: 'replaces slash with underscore' },
        { input: 'foo zub', output: 'foo_zub', case: 'replaces space with underscore' },
        { input: 'foo:bar', output: 'fooXbar', replaceString: 'X', case: 'replaces dot with replaceString' },
        { input: 'foo🤷bar/zu b.txt', output: 'foo_bar_zu_b.txt', case: 'docstring example' },
        { input: 'foo.txt', output: 'foo.txt', case: 'keeps dot' },
        { input: 'züb', output: 'züb', case: 'keeps special chars' },
    ]
    cases.forEach(testCase => {
        it(testCase.case, function () {
            assert.strictEqual(sanitizeFilename(testCase.input, testCase.replaceString), testCase.output)
        })
    })
})
