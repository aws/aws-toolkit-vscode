/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as moment from 'moment'
import { default as stripAnsi } from 'strip-ansi'
import { isCloud9 } from '../extensionUtilities'
import { getLogger } from '../logger'

/**
 * Truncates string `s` if it exceeds `n` chars.
 *
 * If `n` is negative, truncates at start instead of end.
 *
 * @param s String to truncate
 * @param n Truncate top-level string properties exceeding this length
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
export function getStringHash(text: string): string {
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

export function getRelativeDate(from: Date, now: Date = new Date()): string {
    // Prevent clock skew showing future date
    return moment(from).subtract(5, 'second').from(now)
}
