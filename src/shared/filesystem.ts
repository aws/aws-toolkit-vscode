/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as _path from 'path'

const mkdir = fs.promises.mkdir

async function mkdirRecursive(path: string, options: fs.MakeDirectoryOptions): Promise<void> {
    const parent = _path.dirname(path)
    if (parent !== path) {
        await mkdir(parent, options)
    }

    await mkdir(path, options)
}

// functions
export const access = fs.promises.access

export const readFile = fs.promises.readFile

export const readdir = fs.promises.readdir

export const stat = fs.promises.stat

export const unlink = fs.promises.unlink

export const writeFile = fs.promises.writeFile

interface ErrorWithCode {
    code?: string
}

async function mkdirSafe(
    path: fs.PathLike,
    options?: number | string | fs.MakeDirectoryOptions | undefined | null
): Promise<void> {
    try {
        await mkdir(path, options)
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

export { mkdirSafe as mkdir }
