/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { fs } from '../../shared/fs/fs'
import { collectFiles, CollectFilesOptions } from '../../shared/utilities/workspaceUtils'
import { CurrentWsFolders } from '../commons/types'
import { ZipStream } from '../../shared/utilities/zipStream'
import { hasCode } from '../../shared/errors'

export interface ZippedResult {
    zipFileBuffer: Buffer
    zipFileChecksum: string
    totalFileBytes: number
}

interface ZipProjectOptions {
    zip?: ZipStream
}

export async function zipProject(
    repoRootPaths: string[],
    workspaceFolders: CurrentWsFolders,
    collectFilesOptions: CollectFilesOptions,
    isExcluded: (relativePath: string, fileSize: number) => boolean,
    options?: ZipProjectOptions
): Promise<ZippedResult> {
    const zip = options?.zip ?? new ZipStream()
    const files = await collectFiles(repoRootPaths, workspaceFolders, collectFilesOptions)
    const zippedFiles = new Set()
    let totalBytes: number = 0
    for (const file of files) {
        if (zippedFiles.has(file.zipFilePath)) {
            continue
        }
        zippedFiles.add(file.zipFilePath)

        const fileSize = await fs
            .stat(file.fileUri.fsPath)
            .then((r) => r.size)
            .catch((e) => {
                if (hasCode(e) && e.code === 'ENOENT') {
                    // No-op: Skip if file does not exist
                    return
                }
                throw e
            })
        if (!fileSize) {
            continue
        }

        if (isExcluded(file.relativeFilePath, fileSize)) {
            continue
        }

        totalBytes += fileSize
        // Paths in zip should be POSIX compliant regardless of OS
        // Reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
        const posixPath = file.zipFilePath.split(path.sep).join(path.posix.sep)

        try {
            zip.writeFile(file.fileUri.fsPath, posixPath)
        } catch (error) {
            if (error instanceof Error && error.message.includes('File not found')) {
                // No-op: Skip if file was deleted or does not exist
                // Reference: https://github.com/cthackers/adm-zip/blob/1cd32f7e0ad3c540142a76609bb538a5cda2292f/adm-zip.js#L296-L321
                continue
            }
            throw error
        }
    }

    const zipResult = await zip.finalize()
    const zipFileBuffer = zipResult.streamBuffer.getContents() || Buffer.from('')
    return {
        zipFileBuffer,
        zipFileChecksum: zipResult.hash,
        totalFileBytes: totalBytes,
    }
}
