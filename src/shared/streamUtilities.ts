/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as stream from 'stream'

export async function promisifyWriteStream(writeStream: stream.Writable): Promise<void> {
    return new Promise((resolve, reject) => {
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
    })
}

export async function promisifyReadStream(
    readStream: stream.Readable,
    dataListener?: (chunk: any) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        readStream.on('end', resolve)
        readStream.on('error', reject)

        if (dataListener) {
            readStream.on('data', dataListener)
        }
    })
}
