/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WritableStreamBuffer } from 'stream-buffers'
import crypto from 'crypto'
import { readFileAsString } from '../filesystemUtilities'

// Does not offer CommonJS support officially: https://github.com/gildas-lormeau/zip.js/issues/362.
// Webpack appears to handle this for us expirementally.
// @ts-ignore
import { ZipWriter, TextReader, ZipReader, Uint8ArrayReader, EntryMetaData, Entry } from '@zip.js/zip.js'
import { getLogger } from '../logger/logger'
import fs from '../fs/fs'

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
    private _zipWriter: ZipWriter<WritableStream>
    private _streamBuffer: WritableStreamBuffer
    private _hasher: crypto.Hash
    private _numberOfFilesToStream: number = 0
    private _numberOfFilesSucceeded: number = 0
    private _filesToZip: [string, string][] = []
    private _filesBeingZipped: number = 0
    private _maxNumberOfFileStreams: number
    boundFileCompletionCallback: (computedSize: number) => Promise<void>
    boundFileStartCallback: (computedSize: number) => Promise<void>

    constructor(props: Partial<ZipStreamProps> = {}) {
        getLogger().debug('Initializing ZipStream with props: %O', props)
        // Allow any user-provided values to override default values
        const mergedProps = { ...defaultProps, ...props }
        const { hashAlgorithm, compressionLevel, maxNumberOfFileStreams } = mergedProps

        this.boundFileCompletionCallback = this.onFinishedCompressingFile.bind(this)
        this.boundFileStartCallback = this.onStartCompressingFile.bind(this)

        this._zipWriter = new ZipWriter(
            new WritableStream({
                write: (chunk) => {
                    this._streamBuffer.write(chunk)
                    this._hasher.update(chunk)
                },
            }),
            { level: compressionLevel }
        )
        this._maxNumberOfFileStreams = maxNumberOfFileStreams

        this._streamBuffer = new WritableStreamBuffer()

        this._hasher = crypto.createHash(hashAlgorithm)
    }

    public async onStartCompressingFile(_totalBytes: number): Promise<void> {
        this._filesBeingZipped++
    }

    public async onFinishedCompressingFile(_computedsize: number) {
        this._numberOfFilesSucceeded++
        this._filesBeingZipped--

        if (this._filesToZip.length > 0 && this._filesBeingZipped < this._maxNumberOfFileStreams) {
            const [fileToZip, path] = this._filesToZip.shift()!
            void readFileAsString(fileToZip).then((content) => {
                return this._zipWriter.add(path, new TextReader(content), {
                    onend: this.boundFileCompletionCallback,
                    onstart: this.boundFileStartCallback,
                })
            })
        }
    }
    /**
     * Writes data to the specified path.
     * @param data
     * @param path
     * @param returnPromise optional parameter specifying if caller wants a promise.
     * @returns promise to that resolves when data is written.
     */
    public writeString(data: string, path: string, returnPromise: true): Promise<EntryMetaData>
    public writeString(data: string, path: string, returnPromise?: false): void
    public writeString(data: string, path: string, returnPromise?: boolean): void | Promise<EntryMetaData> {
        const promise = this._zipWriter.add(path, new TextReader(data))
        return returnPromise ? promise : undefined
    }

    /**
     * Add the content for file to zip at path.
     * @param sourceFilePath file to read
     * @param targetFilePath path to write data to in zip.
     */
    public writeFile(sourceFilePath: string, targetFilePath: string) {
        // We use _numberOfFilesToStream to make sure we don't finalize too soon
        // (before the progress event has been fired for the last file)
        // The problem is that we can't rely on progress.entries.total,
        // because files can be added to the queue faster
        // than the progress event is fired
        this._numberOfFilesToStream++
        // We only start zipping another file if we're under our limit
        // of concurrent file streams
        if (this._filesBeingZipped < this._maxNumberOfFileStreams) {
            void readFileAsString(sourceFilePath).then((content) => {
                return this._zipWriter.add(targetFilePath, new TextReader(content), {
                    onend: this.boundFileCompletionCallback,
                    onstart: this.boundFileStartCallback,
                })
            })
        } else {
            // Queue it for later (see "write" event)
            this._filesToZip.push([sourceFilePath, targetFilePath])
        }
    }

    public async finalize(onProgress?: (percentComplete: number) => void): Promise<ZipStreamResult> {
        let finished = false
        // We need to poll to check for all the file streams to be completely processed
        // -- we are keeping track of this via the "progress" event handler
        while (!finished) {
            finished = await new Promise((resolve) => {
                setTimeout(() => {
                    getLogger().verbose(`success is ${this._numberOfFilesSucceeded}/${this._numberOfFilesToStream}`)
                    onProgress?.(Math.floor((100 * this._numberOfFilesSucceeded) / this._numberOfFilesToStream))
                    resolve(this._numberOfFilesToStream <= this._numberOfFilesSucceeded)
                }, 1000)
            })
        }
        // We're done streaming all files, so we can close the zip stream

        await this._zipWriter.close()
        const sizeInBytes = this._streamBuffer.size()
        getLogger().debug('Finished finalizing zipStream with %d bytes of data', sizeInBytes)
        return {
            sizeInBytes,
            hash: this._hasher.digest('base64'),
            streamBuffer: this._streamBuffer,
        }
    }

    public async finalizeToFile(targetPath: string, onProgress?: (percentComplete: number) => void) {
        const result = await this.finalize(onProgress)
        const contents = result.streamBuffer.getContents() || Buffer.from('')
        await fs.writeFile(targetPath, contents)
        return result
    }

    public static async unzip(zipBuffer: Buffer): Promise<Entry[]> {
        const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(zipBuffer)))
        try {
            return await reader.getEntries()
        } finally {
            await reader.close()
        }
    }
}
