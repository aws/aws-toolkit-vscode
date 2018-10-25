/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import {
    access,
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    stat,
    Stats,
    writeFile
} from 'fs'

/* tslint:disable promise-function-async */
export function accessAsync(path: string | Buffer): Promise<void> {
    return new Promise((resolve, reject) => access(path, err => {
        if (!err) {
            resolve()
        } else {
            reject(err)
        }
    }))
}

export function mkdirAsync(path: string | Buffer, mode?: number | string) {
    return new Promise((resolve, reject) => {
        const handler = (err?: NodeJS.ErrnoException) => {
            if (!err) {
                resolve()
            } else {
                reject(err)
            }
        }

        if (!mode) {
            mkdir(path, handler)
        } else if (typeof mode === 'number') {
            mkdir(path, mode as number, handler)
        } else {
            mkdir(path, mode as string, handler)
        }
    })
}

export function mkdtempAsync(prefix: string): Promise<string> {
    return new Promise((resolve, reject) => {
        mkdtemp(prefix, (err, folder) => {
            if (!err) {
                resolve(folder)
            } else {
                reject(err)
            }
        })
    })
}

export function readdirAsync(path: string | Buffer, options?: string | {}): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const handler = (err: NodeJS.ErrnoException, files: string[]) => {
            if (!err) {
                resolve(files)
            } else {
                reject(err)
            }
        }

        if (!!options) {
            readdir(path, options, handler)
        } else {
            readdir(path, handler)
        }
    })
}

export function readFileAsync(filename: string, encoding: string | null): Promise<string | Buffer> {
    return new Promise((resolve, reject) => {
        readFile(filename, encoding, (err, data) => {
            if (!err) {
                resolve(data)
            } else {
                reject(err)
            }
        })
    })
}

export function statAsync(path: string | Buffer): Promise<Stats> {
    return new Promise((resolve, reject) => {
        stat(path, (err, stats) => {
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
            writeFile(filename, data, callback)
        } else if (typeof options === 'string') {
            writeFile(filename, data, options, callback)
        } else if (!!options.mode && typeof options.mode === 'number')  {
            writeFile(filename, data, options as WriteFileOptions<number>, callback)
        } else {
            writeFile(filename, data, options as WriteFileOptions<string>, callback)
        }
    })
}

/* tslint:enable promise-function-async */
