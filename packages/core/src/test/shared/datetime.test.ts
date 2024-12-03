/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { formatLocalized, formatDateTimestamp, getRelativeDate } from '../../shared/datetime'
import { globals } from '../../shared'

// Test that the following imports all equal the expected milliseconds
describe('simple tests', () => {
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
