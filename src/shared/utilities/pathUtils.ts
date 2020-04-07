/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _path from 'path'

export const DRIVE_LETTER_REGEX = /^\w\:/

export function getNormalizedRelativePath(from: string, to: string): string {
    return normalizeSeparator(_path.relative(from, to))
}

export function normalizeSeparator(path: string) {
    return path.split(_path.sep).join(_path.posix.sep)
}

export function dirnameWithTrailingSlash(path: string): string {
    let dirname = _path.dirname(path)
    if (!dirname.endsWith(_path.sep)) {
        dirname += _path.sep
    }

    return dirname
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
