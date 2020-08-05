/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as stream from 'stream'
import * as vscode from 'vscode'

export interface FileStreams {
    createReadStream(uri: vscode.Uri): stream.Readable

    createWriteStream(uri: vscode.Uri): stream.Writable
}

export class DefaultFileStreams implements FileStreams {
    public createReadStream(uri: vscode.Uri): stream.Readable {
        return fs.createReadStream(uri.fsPath)
    }

    public createWriteStream(uri: vscode.Uri): stream.Writable {
        return fs.createWriteStream(uri.fsPath)
    }
}

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

export async function pipe(
    readStream: stream.Readable,
    writeStream: stream.Writable,
    progressListener?: (loadedBytes: number) => void
): Promise<void> {
    try {
        readStream.pipe(writeStream)

        let dataListener: ((chunk: any) => void) | undefined
        if (progressListener) {
            let loadedBytes = 0
            dataListener = (chunk: any) => {
                loadedBytes += chunk.length
                progressListener(loadedBytes)
            }
        }

        await Promise.all([promisifyReadStream(readStream, dataListener), promisifyWriteStream(writeStream)])
    } finally {
        writeStream.end()
    }
}
