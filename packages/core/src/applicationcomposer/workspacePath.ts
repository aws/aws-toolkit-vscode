/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import nodefs from 'fs/promises'
import { isInDirectory } from '../shared/filesystemUtilities'
import { isFileNotFoundError } from '../shared/errors'

/**
 * Returns `true` if `filePath` is inside `directory` after all symbolic links (and Windows
 * junctions) in both paths are resolved.
 *
 * A lexical check (for example with `path.resolve()`) is not sufficient, because file system
 * operations follow symbolic links: a link inside `directory` can point to any location.
 *
 * `filePath` does not have to exist, so this check can be used before a new file is created.
 *
 * Returns `false` (fails closed) if the real location cannot be determined, for example if the
 * path goes through a symbolic link whose target does not exist. A write through such a link
 * creates a file at the link target.
 *
 * Hard links are not detected, because a hard link is an ordinary directory entry.
 */
export async function isRealPathInDirectory(directory: string, filePath: string): Promise<boolean> {
    try {
        const realDirectory = await realPath(path.resolve(directory))
        const realFilePath = await realPath(path.resolve(filePath))
        if (realDirectory === undefined || realFilePath === undefined || realFilePath === realDirectory) {
            return false
        }
        return isInDirectory(realDirectory, realFilePath)
    } catch {
        return false
    }
}

/**
 * Returns the real path of the absolute path `p`. If `p` does not exist, returns the real path of
 * its closest existing ancestor joined with the remaining path segments.
 *
 * Returns `undefined` if `p`, or one of its ancestors, is a symbolic link whose target does not
 * exist. Throws for other file system errors.
 */
async function realPath(p: string): Promise<string | undefined> {
    try {
        return await nodefs.realpath(p)
    } catch (e) {
        if (!isFileNotFoundError(e)) {
            throw e
        }
    }

    // realpath() reports ENOENT for a missing entry and also for a symbolic link whose target is
    // missing. lstat() does not follow the last link, so it succeeds only for the broken link.
    try {
        await nodefs.lstat(p)
        return undefined
    } catch (e) {
        if (!isFileNotFoundError(e)) {
            throw e
        }
    }

    const parent = path.dirname(p)
    if (parent === p) {
        return undefined
    }
    const realParent = await realPath(parent)
    return realParent === undefined ? undefined : path.join(realParent, path.basename(p))
}
