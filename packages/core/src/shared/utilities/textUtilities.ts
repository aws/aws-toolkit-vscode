/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as crypto from 'crypto'
import * as fs from 'fs' // eslint-disable-line no-restricted-imports
import { default as stripAnsi } from 'strip-ansi'
import { getLogger } from '../logger/logger'

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
 * Indents a given string with spaces.
 *
 * @param {string} s - The input string to be indented.
 * @param {number} [size=4] - The number of spaces to use for indentation. Defaults to 4.
 * @param {boolean} [clear=false] - If true, the function will clear any existing indentation and apply the new indentation.
 * @returns {string} The indented string.
 *
 * @example
 * const indentedString = indent('Hello\nWorld', 2);
 * console.log(indentedString); // Output: "  Hello\n  World"
 *
 * @example
 * const indentedString = indent('  Hello\n    World', 4, true);
 * console.log(indentedString); // Output: "    Hello\n    World"
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
 * Previously used to add Cloud9 support (no icons). Might be useful in the future, so let's leave it here.
 */
export function addCodiconToString(codiconName: string, text: string): string {
    return `$(${codiconName}) ${text}`
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

    text.split(/\r|\n/).map((s) => {
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

    fs.close(fd, (err) => {
        if (err) {
            throw err
        }
    })
}

export function toTitleCase(str: string): string {
    return str.charAt(0).toUpperCase().concat(str.slice(1))
}

/**
 * converts keys in an object from camelCase to snake_case
 * e.g.
 * {
 *   fooBar: "fi"
 * }
 *
 * to
 * {
 *   foo_bar: "fi"
 * }
 */
export function toSnakeCase(obj: Record<string, any>) {
    const snakeObj: Record<string, string> = {}

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const snakeKey = key.replace(/([a-z])([A-Z]+)/g, '$1_$2').toLowerCase()
            snakeObj[snakeKey] = obj[key]
        }
    }

    return snakeObj
}

/**
 * To satisfy a pentesting concern, encodes HTML to mitigate risk of HTML injection
 */
export function encodeHTML(str: string) {
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * cleans up a filename of invalid characters, whitespaces and emojis
 * "foo🤷bar/zu b.txt" => "foo_bar_zu_b.txt"
 * @param input filename
 * @param replaceString optionally override default substitution
 * @returns a cleaned name you can safely use as a file or directory name
 */
export function sanitizeFilename(input: string, replaceString = '_'): string {
    return (
        input
            // replace invalid chars
            .replace(/[\/|\\:*?"<>\s]/g, replaceString)
            // replace emojis https://edvins.io/how-to-strip-emojis-from-string-in-java-script
            .replace(
                /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
                replaceString
            )
    )
}

/**
 * A helper function to generate a random string for a specified length
 *
 * @param length - The length of the generated string. Defaults to 32 if length not provided.
 */
export function getRandomString(length = 32) {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

/**
 * Convert a base 64 string to a base 64 url string
 *
 * See: https://datatracker.ietf.org/doc/html/rfc4648#section-5
 * @param base64 a base 64 string
 * @returns a base 64 url string
 */
export function toBase64URL(base64: string) {
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function undefinedIfEmpty(str: string | undefined): string | undefined {
    if (str && str.trim().length > 0) {
        return str
    }

    return undefined
}

export function decodeBase64(base64Str: string): string {
    return Buffer.from(base64Str, 'base64').toString()
}
/**
 * Extracts the file path and selection context from the message.
 *
 * @param {any} message - The message object containing the file and selection context.
 * @returns {Object} - An object with `filePath` and `selection` properties.
 */
export function extractFileAndCodeSelectionFromMessage(message: any) {
    const filePath = message?.context?.activeFileContext?.filePath
    const selection = message?.context?.focusAreaContext?.selectionInsideExtendedCodeBlock as vscode.Selection
    return { filePath, selection }
}
