/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { readFile, writeFile } from 'fs'

/* tslint:disable promise-function-async */
export function readFileAsync(filename: string, encoding: string | null): Promise<string | Buffer> {
    return new Promise((resolve, reject) => {
        readFile(filename, encoding, (err, data) => {
            if (!!err) {
                resolve(data)
            } else {
                reject(err)
            }
        })
    })
}

export function writeFileAsync(filename: string, data: any, encoding: string): Promise<void> {
    return new Promise((resolve, reject) => {
        writeFile(filename, data, encoding, err => {
            if (!!err) {
                resolve()
            } else {
                reject(err)
            }
        })
    })
}
/* tslint:enable promise-function-async */
