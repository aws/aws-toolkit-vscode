/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeWhispererStreaming, ExportResultArchiveCommandInput } from '@amzn/codewhisperer-streaming'
import { ToolkitError } from '../errors'
import fs from '../fs/fs'
import { getUserAgent } from '../telemetry/util'
import * as crypto from 'crypto'

// TODO @jpinkney-aws remove the dependency on node
// eslint-disable-next-line no-restricted-imports
import fetch from 'node-fetch'

/**
 * This class represents the structure of the archive returned by the ExportResultArchive endpoint
 */
export class ExportResultArchiveStructure {
    static readonly PathToSummary = 'summary/summary.md'
    static readonly PathToDiffPatch = 'patch/diff.patch'
    static readonly PathToPatch = 'patch'
    static readonly PathToMetrics = 'metrics/metrics.json'
    static readonly PathToManifest = 'manifest.json'
}

export async function downloadExportResultArchive(
    cwStreamingClient: CodeWhispererStreaming,
    exportResultArchiveArgs: ExportResultArchiveCommandInput,
    toPath: string
) {
    const result = await cwStreamingClient.exportResultArchive(exportResultArchiveArgs)

    const buffer = []

    if (result.body === undefined) {
        throw new ToolkitError('Empty response from Amazon Q inline suggestions streaming service')
    }

    for await (const chunk of result.body) {
        if (chunk.binaryPayloadEvent) {
            const chunkData = chunk.binaryPayloadEvent
            if (chunkData.bytes) {
                buffer.push(chunkData.bytes)
            }
        }
    }

    await fs.writeFile(toPath, Buffer.concat(buffer))
}

// TODO should this just be a resource fetcher?

/**
 * Downloads a file from remoteUrl into memory
 */
export async function downloadFrom(remoteUrl: string) {
    const res = await fetch(remoteUrl, {
        headers: {
            'User-Agent': getUserAgent({ includePlatform: true, includeClientId: true }),
        },
    })
    if (!res.ok) {
        throw new ToolkitError(`Failed to download. Error: ${JSON.stringify(res)}`)
    }

    const hash = crypto.createHash('sha384')
    const chunks: Buffer[] = []
    for await (const chunk of res.body) {
        const bufferChunk = Buffer.from(chunk)
        chunks.push(bufferChunk)
        hash.update(bufferChunk)
    }

    return {
        data: Buffer.concat(chunks),
        hash: hash.digest('hex'),
    }
}
