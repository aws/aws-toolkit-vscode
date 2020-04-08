/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _path from 'path'

export const DRIVE_LETTER_REGEX = /^\w\:/

function isUncPath(path: string) {
    return /^\s*[\/\\]{2}[^\/\\]+/.test(path)
}

export function getNormalizedRelativePath(from: string, to: string): string {
    return normalizeSeparator(_path.relative(from, to))
}

/**
 * - Replaces backslashes "\\" with "/"
 * - Removes redundant path separators (except initial double-slash for UNC-style paths).
 */
export function normalizeSeparator(p: string) {
    const normalized = p.replace(/[\/\\]+/g, '/')
    if (isUncPath(p)) {
        return '/' + normalized
    }
    return normalized
}

export function dirnameWithTrailingSlash(path: string): string {
    let dirname = _path.dirname(path)
    if (!dirname.endsWith(_path.sep)) {
        dirname += _path.sep
    }

    return dirname
}

/**
 * Normalizes path `p`:
 * - Replaces backslashes "\\" with "/".
 * - Removes redundant path separators (except initial double-slash for UNC-style paths).
 * - Uppercases drive-letter (Windows).
 * - ...and returns the result of `path.normalize()`.
 */
export function normalize(p: string): string {
    if (!p || p.length === 0) {
        return p
    }
    const firstChar = p.substring(0, 1)
    if (DRIVE_LETTER_REGEX.test(p.substring(0, 2))) {
        return normalizeSeparator(_path.normalize(firstChar.toUpperCase() + p.substring(1)))
    }
    if (isUncPath(p)) {
        return normalizeSeparator(p)
    }
    return normalizeSeparator(_path.normalize(p))
}

export function getLocalRootVariants(filePath: string): string[] {
    if (process.platform === 'win32' && DRIVE_LETTER_REGEX.test(filePath)) {
        return [
            filePath.replace(DRIVE_LETTER_REGEX, match => match.toLowerCase()),
            filePath.replace(DRIVE_LETTER_REGEX, match => match.toUpperCase()),
        ]
    }

    return [filePath]
}

/**
 * "c:/foo.bar" => "/foo.bar"
 */
export function removeDriveLetter(f: string): string {
    if (!f || f.length < 2 || !DRIVE_LETTER_REGEX.test(f.substring(0, 2))) {
        return f
    }

    return f.substring(2)
}
