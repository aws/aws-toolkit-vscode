/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { access, readFile, writeFile } from 'fs'

/* tslint:disable promise-function-async */
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

/**
 * @description Wraps readFileAsync and resolves the Buffer to a string for convenience
 *
 * @param path filename to read
 * @param encoding Optional - file encoding
 *
 * @returns the contents of the file as a string
 */
export async function readFileAsyncAsString(path: string, encoding?: string): Promise<string> {
    // tslint:disable-next-line:no-null-keyword
    const result = await readFileAsync(path, encoding || null)
    if (result instanceof Buffer) {
        return result.toString(encoding || undefined)
    }

    return result
}

export function writeFileAsync(filename: string, data: any, encoding: string): Promise<void> {
    return new Promise((resolve, reject) => {
        writeFile(filename, data, encoding, err => {
            if (!err) {
                resolve()
            } else {
                reject(err)
            }
        })
    })
}

export function accessAsync(path: string | Buffer): Promise<boolean> {
    return new Promise((resolve, reject) => {
        access(path, err => {
            if (!!err) {
                console.error(`Could not access file '${path}'`)
            }

            resolve(!err)
        })
    })
}
/* tslint:enable promise-function-async */
