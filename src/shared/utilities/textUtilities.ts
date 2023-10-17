/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import { default as stripAnsi } from 'strip-ansi'
import { isCloud9 } from '../extensionUtilities'
import { getLogger } from '../logger'

/**
 * Truncates string `s` if it exceeds `n` chars.
 *
 * If `n` is negative, truncates at start instead of end.
 *
 * @param s String to truncate
 * @param n Truncate after this length
 * @param suffix String appended to truncated value (default: "…")
 */
export function truncate(s: string, n: number, suffix?: string): string {
    suffix = suffix ?? '…'
    if (s.length <= Math.abs(n)) {
        return s
    }
    const start = n < 0 ? s.length - Math.abs(n) : 0
    const end = n < 0 ? s.length : n
    const truncated = s.substring(start, end)
    return n < 0 ? suffix + truncated : truncated + suffix
}

/**
 * Indents a string.
 *
 * @param size Indent width (number of space chars).
 * @param clear Clear existing whitespace, if any.
 * @param s Text to indent.
 */
export function indent(s: string, size: number = 4, clear: boolean = false): string {
    const n = Math.abs(size)
    const spaces = ''.padEnd(n, ' ')
    if (size < 0) {
        throw Error() // TODO: implement "dedent" for negative size.
    }
    if (clear) {
        return s.replace(/^[ \t]*([^\n])/, `${spaces}$1`).replace(/(\n+)[ \t]*([^ \t\n])/g, `$1${spaces}$2`)
    }
    return spaces + s.replace(/(\n+)(.)/g, `$1${spaces}$2`)
}

/**
 * Creates a (shallow) clone of `obj` and truncates its top-level string properties.
 *
 * @param obj Object to copy and truncate
 * @param len Truncate top-level string properties exceeding this length
 * @param propNames Only truncate properties in this list
 * @param suffix String appended to truncated values (default: "…")
 */
export function truncateProps(obj: object, len: number, propNames?: string[], suffix?: string): object {
    if (len <= 0) {
        throw Error(`invalid len: ${len}`)
    }
    // Shallow-copy to avoid modifying the original object.
    const r = { ...obj }

    if (propNames) {
        for (const propName of propNames) {
            try {
                const val = (r as any)[propName]
                if (val !== undefined && typeof val === 'string') {
                    ;(r as any)[propName] = truncate(val, len, suffix)
                }
            } catch {
                // Do nothing ("best effort").
            }
        }
    } else {
        for (const propName of Object.getOwnPropertyNames(r)) {
            try {
                ;(r as any)[propName] = truncate((r as any)[propName], len, suffix)
            } catch {
                // Do nothing ("best effort").
            }
        }
    }

    return r
}

export function removeAnsi(text: string): string {
    try {
        return stripAnsi(text)
    } catch (err) {
        getLogger().error('Unexpected error while removing Ansi from text: %O', err as Error)

        // Fall back to original text so callers aren't impacted
        return text
    }
}

/**
 * Hashes are not guaranteed to be stable across toolkit versions. We may change the implementation.
 */
export function getStringHash(text: string | Buffer): string {
    const hash = crypto.createHash('sha256')

    hash.update(text)

    return hash.digest('hex')
}

/**
 * Temporary util while Cloud9 does not have codicon support
 */
export function addCodiconToString(codiconName: string, text: string): string {
    return isCloud9() ? text : `$(${codiconName}) ${text}`
}

/**
 * Go allows function signatures to be multi-line, so we should parse these into something more usable.
 *
 * @param text String to parse
 *
 * @returns Final output without any new lines or comments
 */
export function stripNewLinesAndComments(text: string): string {
    const blockCommentRegExp = /\/\*.*\*\//
    let result: string = ''

    text.split(/\r|\n/).map(s => {
        const commentStart: number = s.search(/\/\//)
        s = s.replace(blockCommentRegExp, '')
        result += commentStart === -1 ? s : s.substring(0, commentStart)
    })

    return result
}

/**
 * Inserts some text into a file.
 * Very slow for large files so don't use it for that purpose.
 *
 * @param filePath Path to the file to write to
 * @param text String that will be inserted
 * @param line Optional line number to use (0 indexed)
 */
export async function insertTextIntoFile(text: string, filePath: string, line: number = 0) {
    const oldData: Buffer = fs.readFileSync(filePath)
    const lines: string[] = oldData.toString().split(/\r?\n/)
    lines.splice(line, 0, text)

    const newData: Buffer = Buffer.from(lines.join('\n'))
    const fd: number = fs.openSync(filePath, 'w+')

    fs.writeSync(fd, newData, 0, newData.length, 0)

    fs.close(fd, err => {
        if (err) {
            throw err
        }
    })
}

export function toTitleCase(str: string): string {
    return str.charAt(0).toUpperCase().concat(str.slice(1))
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
export function formatLocalized(d: Date = new Date()): string {
    const dateFormat = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
    const timeFormat = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        timeZoneName: 'longOffset',
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

/**
 * To satisfy a pentesting concern, encodes HTML to mitigate risk of HTML injection
 */
export function encodeHTML(str: string) {
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
