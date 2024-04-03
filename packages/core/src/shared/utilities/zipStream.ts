/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import archiver from 'archiver'
import { WritableStreamBuffer } from 'stream-buffers'
import crypto from 'crypto'
import { getLogger } from '../logger'

export interface ZipStreamResult {
    sizeInBytes: number
    md5: string
    buffer: Buffer
}

/**
 * Utility class to create in-memory zip archives that outputs to a stream buffer.
 *
 * Example usage:
 * ```ts
 * const zipStream = new ZipStream()
 * zipStream.writeString('Hello World', 'file1.txt')
 * zipStream.writeFile('/path/to/some/file.txt', 'file2.txt')
 * const result = await zipStream.finalize()
 * console.log(result) // { sizeInBytes: ..., md5: ..., buffer: ... }
 * ```
 */
export class ZipStream {
    private _archive: archiver.Archiver
    private _outputBuffer: WritableStreamBuffer
    private _hasher: crypto.Hash

    constructor() {
        this._archive = archiver('zip')
        this._outputBuffer = new WritableStreamBuffer()
        this._archive.pipe(this._outputBuffer)
        this._hasher = crypto.createHash('md5')

        this._archive.on('data', data => {
            this._hasher.update(data)
        })
        this._archive.on('error', err => {
            throw err
        })
        this._archive.on('warning', err => {
            getLogger().warn(err)
        })
    }

    public writeString(data: string, path: string) {
        this._archive.append(Buffer.from(data, 'utf-8'), { name: path })
    }

    public writeFile(file: string, path: string) {
        this._archive.file(file, { name: path })
    }

    public finalize(): Promise<ZipStreamResult> {
        return new Promise((resolve, reject) => {
            void this._archive.finalize()
            this._archive.on('finish', () => {
                const buffer = this._outputBuffer.getContents()
                if (!buffer) {
                    reject(new Error('No output buffer'))
                    return
                }

                resolve({
                    sizeInBytes: this._archive.pointer(),
                    md5: this._hasher.digest('base64'),
                    buffer,
                })
            })
        })
    }
}
