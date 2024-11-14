/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isCloud9 } from './extensionUtilities'

// constants for working with milliseconds
export const oneSecond = 1000
export const oneMinute = oneSecond * 60
export const oneHour = oneMinute * 60
export const oneDay = oneHour * 24

// Given number of milliseconds elapsed (ex. 4,500,000) return hr / min / sec it represents (ex. "1 hr 15 min")
export function convertToTimeString(durationInMs: number) {
    const time = new Date(durationInMs)
    const hours = time.getUTCHours()
    const minutes = time.getUTCMinutes()
    const seconds = time.getUTCSeconds()
    let timeString = `${seconds} sec`
    if (minutes > 0) {
        timeString = `${minutes} min ${timeString}`
    }
    if (hours > 0) {
        timeString = `${hours} hr ${timeString}`
    }
    return timeString
}

// Given Date object, return timestamp it represents (ex. "01/01/23, 12:00 AM")
export function convertDateToTimestamp(date: Date) {
    return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

/**
 * Gets a relative date between the from date and now date (default: current time)
 * e.g. "in 1 minute", '1 minute ago'
 * works on the scales of seconds, minutes, hours, days, weeks, months, years
 * @param from start Date
 * @param now end Date (default: current time)
 * @returns string representation of relative date
 */
export function getRelativeDate(from: Date, now: Date = new Date()): string {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'long' })

    const second = 1000
    const minute = second * 60
    const hour = minute * 60
    const day = hour * 24
    const week = day * 7

    // Prevent clock skew showing future date - adjust 5 seconds
    const fromAdj = new Date(from.valueOf() - 5 * second)

    const diff = fromAdj.valueOf() - now.valueOf()
    const absDiff = Math.abs(diff)
    // seconds
    if (absDiff < minute) {
        // magnitude is less than a minute
        return rtf.format(Math.floor(diff / second), 'second')
    }
    // minutes
    if (absDiff < hour) {
        // magnitude is less than an hour
        return rtf.format(Math.floor(diff / minute), 'minute')
    }
    // hours
    if (absDiff < day) {
        // magnitude is less than a day
        return rtf.format(Math.floor(diff / hour), 'hour')
    }
    // days
    if (absDiff < week) {
        // magnitude is less than a week
        return rtf.format(Math.floor(diff / day), 'day')
    }
    // weeks
    if (
        (Math.abs(fromAdj.getUTCMonth() - now.getUTCMonth()) === 0 &&
            Math.abs(fromAdj.getUTCFullYear() - now.getUTCFullYear()) === 0) || // same month of same year
        (fromAdj.getUTCMonth() - now.getUTCMonth() === 1 && fromAdj.getUTCDate() < now.getUTCDate()) || // different months, but less than a month apart in terms of numeric days
        (now.getUTCMonth() - fromAdj.getUTCMonth() === 1 && now.getUTCDate() < fromAdj.getUTCDate()) // same as above but in the opposite direction
    ) {
        return rtf.format(Math.floor(diff / week), 'week')
    }
    // months
    if (
        Math.abs(fromAdj.getUTCFullYear() - now.getUTCFullYear()) === 0 || // same year, and all the other conditions above didn't pass
        (fromAdj.getUTCFullYear() - now.getUTCFullYear() === 1 && fromAdj.getUTCMonth() < now.getUTCMonth()) || // different years, but less than a year apart in terms of months
        (now.getUTCFullYear() - fromAdj.getUTCFullYear() === 1 && now.getUTCMonth() < fromAdj.getUTCMonth()) // same as the above, but in reverse
    ) {
        // add/subtract months to make up for the difference between years
        let adjMonths = 0
        if (fromAdj.getUTCFullYear() > now.getUTCFullYear()) {
            adjMonths = 12
        } else if (fromAdj.getUTCFullYear() < now.getUTCFullYear()) {
            adjMonths = -12
        }
        return rtf.format(Math.floor(fromAdj.getUTCMonth() - now.getUTCMonth() + adjMonths), 'month')
    }
    // years
    // if all conditionals above have failed, we're looking in terms of a > 1 year gap
    return rtf.format(Math.floor(fromAdj.getUTCFullYear() - now.getUTCFullYear()), 'year')
}

/**
 * Format for rendering readable dates.
 *
 * Same format used in the S3 console, but it's also locale-aware.
 * This specifically combines a separate date and time format
 * in order to avoid a comma between the date and time.
 *
 * US: Jan 5, 2020 5:30:20 PM GMT-0700
 * GB: 5 Jan 2020 17:30:20 GMT+0100
 */
export function formatLocalized(d: Date = new Date(), cloud9 = isCloud9()): string {
    const dateFormat = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
    const timeFormat = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        timeZoneName: cloud9 ? 'short' : 'shortOffset',
    })

    return `${dateFormat.format(d)} ${timeFormat.format(d)}`
}
/**
 * Matches Insights console timestamp, e.g.: 2019-03-04T11:40:08.781-08:00
 * TODO: Do we want this this verbose? Log stream just shows HH:mm:ss
 */
export function formatDateTimestamp(forceUTC: boolean, d: Date = new Date()): string {
    let offsetString: string
    if (!forceUTC) {
        // manually adjust offset seconds if looking for a GMT timestamp:
        // the date is created in local time, but `getISOString` will always output unadjusted GMT
        d = new Date(d.getTime() - d.getTimezoneOffset() * 1000 * 60)
        offsetString = '+00:00'
    } else {
        // positive offset means GMT-n, negative offset means GMT+n
        // offset is in minutes
        offsetString = `${d.getTimezoneOffset() <= 0 ? '+' : '-'}${(d.getTimezoneOffset() / 60)
            .toString()
            .padStart(2, '0')}:00`
    }
    const iso = d.toISOString()
    // trim 'Z' (last char of iso string) and add offset string
    return `${iso.substring(0, iso.length - 1)}${offsetString}`
}
