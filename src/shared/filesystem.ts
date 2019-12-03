/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as _path from 'path'

async function mkdirRecursive(path: string, options: fs.MakeDirectoryOptions): Promise<void> {
    const parent = _path.dirname(path)
    if (parent !== path) {
        await fs.ensureDir(parent, options)
    }

    await fs.ensureDir(path, options)
}

interface ErrorWithCode {
    code?: string
}

export async function mkdir(
    path: fs.PathLike,
    options?: number | string | fs.MakeDirectoryOptions | undefined | null
): Promise<void> {
    try {
        await fs.promises.mkdir(path, options)
    } catch (err) {
        // mkdir calls with recurse do not work as expected when called through electron.
        // See: https://github.com/nodejs/node/issues/24698#issuecomment-486405542 for info.
        // TODO : When VS Code uses Electron 5+, remove this custom mkdir implementation.
        const error = err as ErrorWithCode
        if (error.code && error.code === 'ENOENT') {
            if (options && typeof options === 'object' && options.recursive && typeof path === 'string') {
                await mkdirRecursive(path, options)

                return
            }
        }

        throw err
    }
}

// Recursive delete including files and folders
export async function rmrf(path: string) {
    const stats = await fs.stat(path)
    if (stats.isFile()) {
        await fs.unlink(path)
    } else if (stats.isDirectory()) {
        const promises = (await fs.readdir(path)).map(async child => rmrf(_path.join(path, child)))

        await Promise.all(promises)
        await fs.rmdir(path)
    } else {
        throw new Error(`Could not delete '${path}' because it is neither a file nor directory`)
    }
}
