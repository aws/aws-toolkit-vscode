/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as _path from 'path'
import { promisify } from 'util'

// interfaces & types
export type PathLike = fs.PathLike
export type MakeDirectoryOptions = fs.MakeDirectoryOptions

export interface Stats extends fs.Stats {
    // fs.Stats is a class, so for easy mocking we code against an interface with the same shape.
}

// functions
export const access = promisify(fs.access)

const _mkdir = promisify(fs.mkdir)
interface ErrorWithCode {
    code?: string
}

export async function mkdir(
    path: PathLike,
    options?: number | string | MakeDirectoryOptions | undefined | null
): Promise<void> {
    try {
        await _mkdir(path, options)
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

async function mkdirRecursive(path: string, options: MakeDirectoryOptions): Promise<void> {
    const parent = _path.dirname(path)
    if (parent !== path) {
        await mkdir(parent, options)
    }

    await mkdir(path, options)
}

export const mkdtemp = promisify(fs.mkdtemp)

export const readFile = promisify(fs.readFile)

export const readdir = promisify(fs.readdir)

export const rename = promisify(fs.rename)

export const stat = promisify(fs.stat)

export const unlink = promisify(fs.unlink)

export const writeFile = promisify(fs.writeFile)
