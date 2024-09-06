/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { CodeWhispererStreaming, ExportResultArchiveCommandInput } from '@amzn/codewhisperer-streaming'
import { ToolkitError } from '../errors'
import fs from '../fs/fs'

/**
 * This class represents the structure of the archive returned by the ExportResultArchive endpoint
 */
export class ExportResultArchiveStructure {
    static readonly PathToSummary = path.join('summary', 'summary.md')
    static readonly PathToDiffPatch = path.join('patch', 'diff.patch')
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
