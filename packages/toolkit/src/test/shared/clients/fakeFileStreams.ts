/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as stream from 'stream'
import * as vscode from 'vscode'
import { FileStreams } from '../../../shared/utilities/streamUtilities'

export class FakeFileStreams implements FileStreams {
    private readonly readData: string
    private readonly readAutomatically: boolean
    public readLocation: vscode.Uri | undefined
    public readStream: stream.Readable | undefined

    public writtenData: string | undefined
    public writtenLocation: vscode.Uri | undefined
    public writeStream: stream.Writable | undefined

    public constructor({
        readData = '',
        readAutomatically = false,
    }: { readData?: string; readAutomatically?: boolean } = {}) {
        this.readData = readData
        this.readAutomatically = readAutomatically
    }

    public createReadStream(uri: vscode.Uri): stream.Readable {
        this.readLocation = uri
        const readData = this.readData

        this.readStream = new stream.Readable({
            objectMode: true,
            read() {
                this.push(readData)
                // MUST be null or else it will not stop reading
                // eslint-disable-next-line unicorn/no-null
                this.push(null)
            },
        })

        if (this.readAutomatically) {
            this.readStream.read()
            this.readStream.read()
        }

        return this.readStream
    }

    public createWriteStream(uri: vscode.Uri): stream.Writable {
        this.writtenLocation = uri

        this.writeStream = new stream.Writable({
            objectMode: true,
            write: (chunk, encoding, callback) => {
                this.writtenData = chunk
                callback()
            },
        })

        return this.writeStream
    }

    public static readStreamFrom(data: string = ''): stream.Readable {
        return new stream.Readable({
            objectMode: true,
            read() {
                this.push(data)
                // MUST be null or else it will not stop reading
                // eslint-disable-next-line unicorn/no-null
                this.push(null)
            },
        })
    }
}
