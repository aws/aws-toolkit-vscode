/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { CodeWhispererStreaming, ExportResultArchiveCommandInput } from '@amzn/codewhisperer-streaming'
import { ToolkitError } from '../../shared/errors'
import { fsCommon } from '../../srcShared/fs'

/**
 * This class represents the structure of the archive returned by the ExportResultArchive endpoint
 */
export class ExportResultArchiveStructure {
    static readonly PathToSummary = path.join('summary', 'summary.md')
    static readonly PathToDiffPatch = path.join('patch', 'diff.patch')
    static readonly PathToSourceDir = 'sources'
    static readonly PathToManifest = 'manifest.json'
}

export async function downloadExportResultArchive(
    cwStreamingClient: CodeWhispererStreaming,
    exportResultArchiveArgs: ExportResultArchiveCommandInput,
    toPath: string
) {
    try {
        const result = await cwStreamingClient.exportResultArchive(exportResultArchiveArgs)

        const buffer = []

        if (result.body === undefined) {
            throw new ToolkitError('Empty response from CodeWhisperer Streaming service.')
        }

        for await (const chunk of result.body) {
            if (chunk.binaryPayloadEvent) {
                const chunkData = chunk.binaryPayloadEvent
                if (chunkData.bytes) {
                    buffer.push(chunkData.bytes)
                }
            }
        }

        await fsCommon.writeFile(toPath, Buffer.concat(buffer))
    } catch (error) {
        throw new ToolkitError('There was a problem fetching the transformed code.')
    }
}
