/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import { Readable, Writable, pipeline } from 'stream'
import * as vscode from 'vscode'

export interface FileStreams {
    createReadStream(uri: vscode.Uri): Readable

    createWriteStream(uri: vscode.Uri): Writable
}

export class DefaultFileStreams implements FileStreams {
    public createReadStream(uri: vscode.Uri): Readable {
        return fs.createReadStream(uri.fsPath)
    }

    public createWriteStream(uri: vscode.Uri): Writable {
        return fs.createWriteStream(uri.fsPath)
    }
}

export function streamToFile(stream: Readable, target: vscode.Uri): Promise<void> {
    if (target.scheme !== 'file') {
        throw new Error('Only files on disk are currently supported for streams')
    }
    const destination = fs.createWriteStream(target.fsPath)

    return pipe(stream, destination)
}

// This is pretty much a specialized Writable stream
class BufferWriter {
    private offset = 0

    public constructor(private readonly buffer: Buffer | number[], private readonly finalSize?: number) {}

    public write(chunk: Buffer) {
        const buffer = this.buffer
        if (Buffer.isBuffer(buffer)) {
            chunk.forEach(byte => (this.offset = buffer.writeUInt8(byte, this.offset)))
        } else {
            buffer.push(...chunk)
            this.offset += chunk.length
        }
    }

    public finish(): Buffer {
        if (this.finalSize && this.finalSize !== this.offset) {
            throw new Error(`Buffer was not completely written to: ${this.offset} < ${this.finalSize}`)
        }
        return Buffer.isBuffer(this.buffer) ? this.buffer : Buffer.from(this.buffer)
    }
}

/**
 * It's assumed that the stream is not using any encoding and emits raw binary.
 *
 * If a size is not provided then a dynamic array is used. This is slower than
 * statically allocated memory but good for situations where the final size is not
 * known.
 *
 * This function could be expanded later to also allow for unsafe allocation of
 * memory if one wanted a bit of extra performance.
 */
export function streamToBuffer(stream: Readable, size?: number): Promise<Buffer> {
    const writer = new BufferWriter(size ? Buffer.alloc(size) : [], size)

    return new Promise<Buffer>((resolve, reject) => {
        stream.on('error', reject)
        stream.on('data', chunk => writer.write(chunk))
        stream.on('end', () => resolve(writer.finish()))
    })
}

export function bufferToStream(buffer: Uint8Array): Readable {
    return new Readable({
        read() {
            this.push(buffer)
            // eslint-disable-next-line no-null/no-null
            this.push(null)
        },
    })
}

export async function pipe(
    readStream: Readable,
    writeStream: Writable,
    progressListener?: (loadedBytes: number) => void
): Promise<void> {
    if (progressListener) {
        readStream.on('data', (chunk: Buffer | string) => progressListener(chunk.length))
    }

    return new Promise<void>((resolve, reject) => {
        pipeline(readStream, writeStream, err => (err ? reject(err) : resolve()))
    })
}
