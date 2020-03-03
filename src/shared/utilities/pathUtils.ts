/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _path from 'path'

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

/**
 * Normalizes filepaths by lowercasing the drive letter for absolute paths on Windows. Does not affect:
 * * relative paths
 * * Unix paths
 * @param filepath Filepath to normalize
 */
export function normalizePathIfWindows(filepath: string): string {
    let alteredPath = filepath
    if (_path.isAbsolute(filepath)) {
        const root = _path.parse(filepath).root
        if (root !== '/') {
            alteredPath = `${filepath.charAt(0).toLowerCase()}${filepath.slice(1)}`
        }
    }

    return alteredPath
}
