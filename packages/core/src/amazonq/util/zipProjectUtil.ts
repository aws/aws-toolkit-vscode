/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'path'
import { collectFiles, CollectFilesOptions, CollectFilesResultItem } from '../../shared/utilities/workspaceUtils'
import { CurrentWsFolders } from '../commons/types'
import { ZipStream } from '../../shared/utilities/zipStream'

export interface ZippedWorkspaceResult {
    zipFileBuffer: Buffer
    zipFileChecksum: string
    totalFileBytes: number
}

interface ZipProjectOptions {
    zip?: ZipStream
}

interface ZipProjectCustomizations {
    isExcluded?: (file: CollectFilesResultItem) => boolean
    checkForError?: (file: CollectFilesResultItem) => Error | undefined
    computeSideEffects?: (file: CollectFilesResultItem) => Promise<void> | void
}

export async function zipProject(
    repoRootPaths: string[],
    workspaceFolders: CurrentWsFolders,
    collectFilesOptions: CollectFilesOptions,
    customizations?: ZipProjectCustomizations,
    options?: ZipProjectOptions
): Promise<ZippedWorkspaceResult> {
    const zip = options?.zip ?? new ZipStream()
    const files = await collectFiles(repoRootPaths, workspaceFolders, collectFilesOptions)
    const zippedFiles = new Set()
    let totalBytes: number = 0
    for (const file of files) {
        if (zippedFiles.has(file.zipFilePath)) {
            continue
        }
        zippedFiles.add(file.zipFilePath)

        if (customizations?.isExcluded && customizations.isExcluded(file)) {
            continue
        }
        const errorToThrow = customizations?.checkForError ? customizations.checkForError(file) : undefined
        if (errorToThrow) {
            throw errorToThrow
        }

        if (customizations?.computeSideEffects) {
            await customizations.computeSideEffects(file)
        }

        totalBytes += file.fileSizeBytes
        // Paths in zip should be POSIX compliant regardless of OS
        // Reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
        const posixPath = file.zipFilePath.split(path.sep).join(path.posix.sep)

        try {
            // filepath will be out-of-sync for files with unsaved changes.
            if (file.isText) {
                zip.writeString(file.fileContent, posixPath)
            } else {
                zip.writeFile(file.fileUri.fsPath, posixPath)
            }
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
