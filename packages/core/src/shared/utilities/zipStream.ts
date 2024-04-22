/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WritableStreamBuffer } from 'stream-buffers'
import crypto from 'crypto'
import { readFileAsString } from '../filesystemUtilities'
// Use require instead of import since this package doesn't support commonjs
const { ZipWriter, TextReader } = require('@zip.js/zip.js')

export interface ZipStreamResult {
    sizeInBytes: number
    md5: string
    streamBuffer: WritableStreamBuffer
}

/**
 * Creates in-memory zip archives that output to a stream buffer.
 *
 * Example usage:
 * ```ts
 * const zipStream = new ZipStream()
 * zipStream.writeString('Hello World', 'file1.txt')
 * zipStream.writeFile('/path/to/some/file.txt', 'file2.txt')
 * const result = await zipStream.finalize()
 * console.log(result) // { sizeInBytes: ..., md5: ..., streamBuffer: ... }
 * ```
 */
export class ZipStream {
    // TypeScript compiler is confused about using ZipWriter as a type
    // @ts-ignore
    private _zipWriter: ZipWriter<WritableStream>
    private _streamBuffer: WritableStreamBuffer
    private _hasher: crypto.Hash

    constructor() {
        this._streamBuffer = new WritableStreamBuffer()
        this._hasher = crypto.createHash('md5')

        this._zipWriter = new ZipWriter(
            new WritableStream({
                write: chunk => {
                    this._streamBuffer.write(chunk)
                    this._hasher.update(chunk)
                },
            })
        )
    }

    public async writeString(data: string, path: string) {
        return this._zipWriter.add(path, new TextReader(data))
    }

    public async writeFile(file: string, path: string) {
        const content = await readFileAsString(file)
        return this._zipWriter.add(path, new TextReader(content))
    }

    public async finalize(): Promise<ZipStreamResult> {
        await this._zipWriter.close()
        return {
            sizeInBytes: this._streamBuffer.size(),
            md5: this._hasher.digest('base64'),
            streamBuffer: this._streamBuffer,
        }
    }
}
