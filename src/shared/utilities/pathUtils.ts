/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as _path from 'path'

export const driveLetterRegex = /^[a-zA-Z]\:/

/**
 * Expands "~" at the start of `fname` to user home dir.
 * TODO: expand env vars too.
 */
export function resolvePath(fname: string) {
    const homedir = os.homedir()
    if (fname.startsWith('~/') || fname.startsWith('~\\')) {
        return _path.join(homedir, fname.substring(2))
    }

    return fname
}

function isUncPath(path: string) {
    return /^\s*[\/\\]{2}[^\/\\]+/.test(path)
}

/**
 * Decides if `path1` is logically equivalent to `path2`, after resolving to
 * absolute paths (relative to `logicalRoot`) and normalizing for
 * case-insensitive filesystems, path separators, etc.
 *
 * @param logicalRoot Resolve relative paths against this directory
 * @param path1 Path to compare
 * @param path2 Path to compare
 * @param stripLeadingVar Optionally strip leading VS Code launch config variables
 */
export function areEqual(
    logicalRoot: string | undefined,
    path1: string,
    path2: string,
    stripLeadingVar: boolean = true
): boolean {
    if (stripLeadingVar) {
        path1 = path1.replace(/^\${[a-zA-Z]{1,}}[\/\\]/, '')
        path2 = path2.replace(/^\${[a-zA-Z]{1,}}[\/\\]/, '')
    }
    const fullPath1 = _path.resolve(logicalRoot ? logicalRoot + '/' : '', path1)
    const fullPath2 = _path.resolve(logicalRoot ? logicalRoot + '/' : '', path2)
    const normalized1 = normalize(fullPath1)
    const normalized2 = normalize(fullPath2)
    if (os.platform() === 'win32') {
        return normalized1.toLowerCase() === normalized2.toLowerCase()
    }
    return normalized1 === normalized2
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

export function normalizedDirnameWithTrailingSlash(path: string): string {
    const dir = normalize(path)
    let dirname = _path.dirname(dir)
    if (!dirname.endsWith('/')) {
        dirname += '/'
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
    if (driveLetterRegex.test(p.substring(0, 2))) {
        return normalizeSeparator(_path.normalize(firstChar.toUpperCase() + p.substring(1)))
    }
    if (isUncPath(p)) {
        return normalizeSeparator(p)
    }
    return normalizeSeparator(_path.normalize(p))
}

export function getLocalRootVariants(filePath: string): string[] {
    if (process.platform === 'win32' && driveLetterRegex.test(filePath)) {
        return [
            filePath.replace(driveLetterRegex, match => match.toLowerCase()),
            filePath.replace(driveLetterRegex, match => match.toUpperCase()),
        ]
    }

    return [filePath]
}

/**
 * Returns the driveletter of `path` after resolving to absolute.
 *
 * "c:/foo.bar" => "c"
 */
export function getDriveLetter(path: string): string {
    const fullpath = _path.resolve(path)
    if (!fullpath || fullpath.length < 2 || !driveLetterRegex.test(fullpath.substring(0, 2))) {
        return ''
    }

    return fullpath.substring(0, 1)
}
