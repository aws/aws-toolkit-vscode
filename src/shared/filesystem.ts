/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as fs from 'fs'

export async function accessAsync(path: string | Buffer): Promise<void> {
    await new Promise<void>((resolve, reject) => fs.access(path, err => {
        if (!err) {
            resolve()
        } else {
            reject(err)
        }
    }))
}

export async function mkdirAsync(
    path: fs.PathLike,
    options?: number | string | fs.MakeDirectoryOptions | undefined | null
): Promise<void> {
    await new Promise<void>((resolve, reject) => fs.mkdir(path, options, err => {
        if (!err) {
            resolve()
        } else {
            reject(err)
        }
    }))
}

export async function mkdtempAsync(prefix: string): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        fs.mkdtemp(prefix, (err, folder) => {
            if (!err) {
                resolve(folder)
            } else {
                reject(err)
            }
        })
    })
}

export async function readdirAsync(
    path: string | Buffer,
    options?: {
        encoding: BufferEncoding | null
        withFileTypes?: false
    } | BufferEncoding | undefined | null
): Promise<string[]> {
    return await new Promise<string[]>((resolve, reject) => {
        fs.readdir(path, options, (err, files) => {
            if (!err) {
                resolve(files)
            } else {
                reject(err)
            }
        })
    })
}

export async function readFileAsync(filename: string, encoding: string | null): Promise<string | Buffer> {
    return await new Promise<string | Buffer>((resolve, reject) => {
        fs.readFile(filename, encoding, (err, data) => {
            if (!err) {
                resolve(data)
            } else {
                reject(err)
            }
        })
    })
}

export async function rmdirAsync(path: fs.PathLike): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        fs.rmdir(path, err => {
            if (!err) {
                resolve()
            } else {
                reject(err)
            }
        })
    })
}

export async function statAsync(path: string | Buffer): Promise<fs.Stats> {
    return await new Promise<fs.Stats>((resolve, reject) => {
        fs.stat(path, (err, stats) => {
            if (!err) {
                resolve(stats)
            } else {
                reject(err)
            }
        })
    })
}

export async function writeFileAsync(
    filename: string,
    data: any,
    // fs.WriteFileOptions includes null, but not undefined.
    // tslint:disable-next-line:no-null-keyword
    options: fs.WriteFileOptions = null
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        fs.writeFile(filename, data, options, err => {
            if (!err) {
                resolve()
            } else {
                reject(err)
            }
        })
    })
}
