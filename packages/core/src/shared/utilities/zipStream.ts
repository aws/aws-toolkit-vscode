/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WritableStreamBuffer } from 'stream-buffers'
import crypto from 'crypto'
import { readFileAsString } from '../filesystemUtilities'
// Use require instead of import since this package doesn't support commonjs
const { ZipWriter, TextReader } = require('@zip.js/zip.js')
import { getLogger } from '../logger/logger'

export interface ZipStreamResult {
    sizeInBytes: number
    hash: string
    streamBuffer: WritableStreamBuffer
}

export type ZipStreamProps = {
    hashAlgorithm: 'md5' | 'sha256'
    maxNumberOfFileStreams: number
    compressionLevel: number
}

const defaultProps: ZipStreamProps = {
    hashAlgorithm: 'sha256',
    maxNumberOfFileStreams: 100,
    compressionLevel: 1,
}

/**
 * Creates in-memory zip archives that output to a stream buffer.
 *
 * Example usage:
 * ```ts
 * const zipStream = new ZipStream({
            hashAlgorithm: 'sha256',
            maxNumberOfFileStreams: 150,
            compressionLevel: 1,
            memLevel: 9,
        })
 * zipStream.writeString('Hello World', 'file1.txt')
 * zipStream.writeFile('/path/to/some/file.txt', 'file2.txt')
 * const result = await zipStream.finalize([optional onProgress handler, called 1x per sec])
 * console.log(result) // { sizeInBytes: ..., hash: ..., streamBuffer: ... }
 * ```
 */
export class ZipStream {
    // TypeScript compiler is confused about using ZipWriter as a type
    // @ts-ignore
    private _zipWriter: ZipWriter<WritableStream>
    private _streamBuffer: WritableStreamBuffer
    private _hasher: crypto.Hash
    private _numberOfFilesToStream: number = 0
    private _numberOfFilesSucceeded: number = 0
    private _filesToZip: [string, string][] = []
    private _filesBeingZipped: number = 0
    private _maxNumberOfFileStreams: number

    constructor(props: Partial<ZipStreamProps> = {}) {
        // Allow any user-provided values to override default values
        const mergedProps = { ...defaultProps, ...props }
        const { hashAlgorithm, compressionLevel, maxNumberOfFileStreams } = mergedProps

        this._zipWriter = new ZipWriter(
            new WritableStream({
                write: chunk => {
                    this._streamBuffer.write(chunk)
                    this._hasher.update(chunk)
                    this._numberOfFilesSucceeded++
                    this._filesBeingZipped--

                    if (this._filesToZip.length > 0 && this._filesBeingZipped < maxNumberOfFileStreams) {
                        this._filesBeingZipped++
                        const [fileToZip, path] = this._filesToZip.shift()!
                        void readFileAsString(fileToZip).then(content => {
                            return this._zipWriter.add(path, new TextReader(content))
                        })
                    }
                },
            }),
            { level: compressionLevel }
        )
        this._maxNumberOfFileStreams = maxNumberOfFileStreams

        this._streamBuffer = new WritableStreamBuffer()

        this._hasher = crypto.createHash(hashAlgorithm)
    }

    public writeString(data: string, path: string) {
        return this._zipWriter.add(path, new TextReader(data))
    }

    public writeFile(file: string, path: string) {
        // We use _numberOfFilesToStream to make sure we don't finalize too soon
        // (before the progress event has been fired for the last file)
        // The problem is that we can't rely on progress.entries.total,
        // because files can be added to the queue faster
        // than the progress event is fired
        this._numberOfFilesToStream++
        // We only start zipping another file if we're under our limit
        // of concurrent file streams
        if (this._filesBeingZipped < this._maxNumberOfFileStreams) {
            this._filesBeingZipped++
            void readFileAsString(file).then(content => {
                return this._zipWriter.add(path, new TextReader(content))
            })
        } else {
            // Queue it for later (see "write" event)
            this._filesToZip.push([file, path])
        }
    }

    public async finalize(onProgress?: (percentComplete: number) => void): Promise<ZipStreamResult> {
        let finished = false
        // We need to poll to check for all the file streams to be completely processed
        // -- we are keeping track of this via the "progress" event handler
        while (!finished) {
            finished = await new Promise(resolve => {
                setTimeout(() => {
                    getLogger().verbose('success is', this._numberOfFilesSucceeded, '/', this._numberOfFilesToStream)
                    onProgress?.(Math.floor((100 * this._numberOfFilesSucceeded) / this._numberOfFilesToStream))
                    resolve(this._numberOfFilesToStream <= this._numberOfFilesSucceeded)
                }, 1000)
            })
        }
        // We're done streaming all files, so we can close the zip stream

        await this._zipWriter.close()
        return {
            sizeInBytes: this._streamBuffer.size(),
            hash: this._hasher.digest('base64'),
            streamBuffer: this._streamBuffer,
        }
    }
}
