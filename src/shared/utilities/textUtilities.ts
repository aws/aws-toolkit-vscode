/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import { default as stripAnsi } from 'strip-ansi'
import { isCloud9 } from '../extensionUtilities'
import { getLogger } from '../logger'

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
