/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import vscode from 'vscode'
import path from 'path'
import {
    collectFiles,
    CollectFilesOptions,
    CollectFilesResultItem,
    getFileInfo,
} from '../../shared/utilities/workspaceUtils'
import { CurrentWsFolders } from '../commons/types'
import { ZipStream } from '../../shared/utilities/zipStream'

export interface ZippedWorkspaceResult {
    zipFileBuffer: Buffer
    zipFileChecksum: string
    totalFileBytes: number
}

interface ZipFileAddedResult {
    result: 'added'
    addedBytes: number
}

interface ZipFileSkippedResult {
    result: 'skipped'
    reason: 'excluded' | 'missing'
}

interface ZipProjectOptions {
    includeProjectName?: boolean
    nonPosixPath?: boolean
}

export type ZipExcluder = (file: Omit<CollectFilesResultItem, 'workspaceFolder'>) => boolean
export type ZipErrorCheck = (file: Omit<CollectFilesResultItem, 'workspaceFolder'>) => Error | undefined
export type ZipTracker = (file: Omit<CollectFilesResultItem, 'workspaceFolder'>) => Promise<void> | void

interface ZipProjectCustomizations {
    isExcluded?: ZipExcluder
    checkForError?: ZipErrorCheck
    computeSideEffects?: ZipTracker
}

export async function addFileToZip(
    file: Omit<CollectFilesResultItem, 'workspaceFolder'>,
    targetFilePath: string,
    zip: ZipStream,
    customizations?: ZipProjectCustomizations,
    options?: ZipProjectOptions
): Promise<ZipFileAddedResult | ZipFileSkippedResult> {
    if (customizations?.isExcluded && customizations.isExcluded(file)) {
        return { result: 'skipped', reason: 'excluded' }
    }
    const errorToThrow = customizations?.checkForError ? customizations.checkForError(file) : undefined
    if (errorToThrow) {
        throw errorToThrow
    }

    try {
        // filepath will be out-of-sync for files with unsaved changes.
        if (file.isText) {
            zip.writeString(file.fileContent, targetFilePath)
        } else {
            zip.writeFile(file.fileUri.fsPath, path.dirname(targetFilePath))
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes('File not found')) {
            // No-op: Skip if file was deleted or does not exist
            // Reference: https://github.com/cthackers/adm-zip/blob/1cd32f7e0ad3c540142a76609bb538a5cda2292f/adm-zip.js#L296-L321
            return { result: 'skipped', reason: 'missing' }
        }
        throw error
    }

    if (customizations?.computeSideEffects) {
        await customizations.computeSideEffects(file)
    }

    return { result: 'added', addedBytes: file.fileSizeBytes }
}

export async function addProjectToZip(
    repoRootPaths: string[],
    workspaceFolders: CurrentWsFolders,
    collectFilesOptions: CollectFilesOptions,
    zip: ZipStream,
    customizations?: ZipProjectCustomizations,
    options?: ZipProjectOptions
) {
    const files = await collectFiles(repoRootPaths, workspaceFolders, collectFilesOptions)
    const zippedFiles = new Set()
    let totalBytes: number = 0
    for (const file of files) {
        if (zippedFiles.has(file.zipFilePath)) {
            continue
        }
        zippedFiles.add(file.zipFilePath)

        // Paths in zip should be POSIX compliant regardless of OS
        // Reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
        const zipFilePath = options?.includeProjectName
            ? path.join(path.basename(file.workspaceFolder.uri.fsPath), file.zipFilePath)
            : file.zipFilePath
        const targetPath = options?.nonPosixPath ? zipFilePath : zipFilePath.split(path.sep).join(path.posix.sep)

        const addFileResult = await addFileToZip(file, targetPath, zip, customizations, options)
        if (addFileResult.result === 'added') {
            totalBytes += addFileResult.addedBytes
        }
    }

    return { zip, totalBytesAdded: totalBytes }
}

export async function zipProject(
    repoRootPaths: string[],
    workspaceFolders: CurrentWsFolders,
    collectFilesOptions: CollectFilesOptions,
    customizations?: ZipProjectCustomizations,
    options?: ZipProjectOptions & { zip?: ZipStream }
): Promise<ZippedWorkspaceResult> {
    const { zip, totalBytesAdded } = await addProjectToZip(
        repoRootPaths,
        workspaceFolders,
        collectFilesOptions,
        options?.zip ?? new ZipStream(),
        customizations,
        options
    )
    const zipResult = await zip.finalize()
    const zipFileBuffer = zipResult.streamBuffer.getContents() || Buffer.from('')
    return {
        zipFileBuffer,
        zipFileChecksum: zipResult.hash,
        totalFileBytes: totalBytesAdded,
    }
}
// TODO: remove vscode dep
export async function zipFile(
    file: vscode.Uri,
    targetPath: string,
    customizations?: ZipProjectCustomizations,
    options?: ZipProjectOptions
) {
    return await addFileToZip(
        {
            ...(await getFileInfo(file, true)),
            zipFilePath: targetPath,
            relativeFilePath: file.fsPath,
        },
        targetPath,
        new ZipStream(),
        customizations,
        options
    )
}
