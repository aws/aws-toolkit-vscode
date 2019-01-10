/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as fs from 'fs'

/* tslint:disable promise-function-async */
export function accessAsync(path: string | Buffer): Promise<void> {
    return new Promise((resolve, reject) => fs.access(path, err => {
        if (!err) {
            resolve()
        } else {
            reject(err)
        }
    }))
}

export function mkdirAsync(path: string | Buffer, mode?: number | string) {
    return new Promise<void>((resolve, reject) => {
        const handler = (err?: NodeJS.ErrnoException) => {
            if (!err) {
                resolve()
            } else {
                reject(err)
            }
        }

        if (!mode) {
            fs.mkdir(path, handler)
        } else if (typeof mode === 'number') {
            fs.mkdir(path, mode as number, handler)
        } else {
            fs.mkdir(path, mode as string, handler)
        }
    })
}

export function mkdtempAsync(prefix: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.mkdtemp(prefix, (err, folder) => {
            if (!err) {
                resolve(folder)
            } else {
                reject(err)
            }
        })
    })
}

export function readdirAsync(
    path: string | Buffer,
    options?: {
        encoding: BufferEncoding | null
        withFileTypes?: false
    } | BufferEncoding | undefined | null
): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const handler = (err: NodeJS.ErrnoException, files: string[]) => {
            if (!err) {
                resolve(files)
            } else {
                reject(err)
            }
        }

        if (!!options) {
            fs.readdir(path, options, handler)
        } else {
            fs.readdir(path, handler)
        }
    })
}

export function readFileAsync(filename: string, encoding: string | null): Promise<string | Buffer> {
    return new Promise((resolve, reject) => {
        fs.readFile(filename, encoding, (err, data) => {
            if (!err) {
                resolve(data)
            } else {
                reject(err)
            }
        })
    })
}

export function statAsync(path: string | Buffer): Promise<fs.Stats> {
    return new Promise((resolve, reject) => {
        fs.stat(path, (err, stats) => {
            if (!err) {
                resolve(stats)
            } else {
                reject(err)
            }
        })
    })
}

interface WriteFileOptions<TMode extends number | string> {
    encoding?: string
    mode?: TMode
    flag?: string
}

export function writeFileAsync(
    filename: string,
    data: any,
    options?: string | WriteFileOptions<number> | WriteFileOptions<string>
): Promise<void> {
    return new Promise((resolve, reject) => {
        const callback = (err: NodeJS.ErrnoException) => {
            if (!err) {
                resolve()
            } else {
                reject(err)
            }
        }

        if (!options) {
            fs.writeFile(filename, data, callback)
        } else if (typeof options === 'string') {
            fs.writeFile(filename, data, options, callback)
        } else if (!!options.mode && typeof options.mode === 'number')  {
            fs.writeFile(filename, data, options as WriteFileOptions<number>, callback)
        } else {
            fs.writeFile(filename, data, options as WriteFileOptions<string>, callback)
        }
    })
}

/* tslint:enable promise-function-async */
