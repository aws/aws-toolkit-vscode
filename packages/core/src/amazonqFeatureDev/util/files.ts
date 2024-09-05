/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { collectFiles } from '../../shared/utilities/workspaceUtils'

import AdmZip from 'adm-zip'
import { ContentLengthError, PrepareRepoFailedError } from '../errors'
import { getLogger } from '../../shared/logger/logger'
import { maxFileSizeBytes } from '../limits'
import { createHash } from 'crypto'
import { CurrentWsFolders } from '../types'
import { ToolkitError } from '../../shared/errors'
import { AmazonqCreateUpload, Metric, telemetry as amznTelemetry } from '../../shared/telemetry/telemetry'
import { TelemetryHelper } from './telemetryHelper'
import { maxRepoSizeBytes } from '../constants'
import { isCodeFile } from '../../shared/filetypes'

const getSha256 = (file: Buffer) => createHash('sha256').update(file).digest('base64')

/**
 * Prepares repository data by zipping files and generating a checksum.
 * @param {string[]} repoRootPaths - The root paths of the repository.
 * @param {CurrentWsFolders} workspaceFolders - The current workspace folders.
 * @param {TelemetryHelper} telemetry - The telemetry helper instance.
 * @param {Metric<AmazonqCreateUpload>} span - The metric span for Amazon Q create upload.
 * @returns {Promise<{zipFileBuffer: Buffer, zipFileChecksum: string}>} A promise that resolves to an object containing the zip file buffer and its checksum.
 * @throws {ContentLengthError} If the content length exceeds the maximum allowed size.
 * @throws {PrepareRepoFailedError} If the preparation of the repository data fails.
 */
export async function prepareRepoData(
    repoRootPaths: string[],
    workspaceFolders: CurrentWsFolders,
    telemetry: TelemetryHelper,
    span: Metric<AmazonqCreateUpload>
) {
    try {
        const files = await collectFiles(repoRootPaths, workspaceFolders, true, maxRepoSizeBytes)
        const zip = new AdmZip()

        let totalBytes = 0
        const ignoredExtensionMap = new Map<string, number>()

        for (const file of files) {
            const fileSize = (await vscode.workspace.fs.stat(file.fileUri)).size
            const isCodeFile_ = isCodeFile(file.relativeFilePath)

            if (fileSize >= maxFileSizeBytes || !isCodeFile_) {
                if (!isCodeFile_) {
                    const re = /(?:\.([^.]+))?$/
                    const extensionArray = re.exec(file.relativeFilePath)
                    const extension = extensionArray?.length ? extensionArray[1] : undefined
                    if (extension) {
                        const currentCount = ignoredExtensionMap.get(extension)

                        ignoredExtensionMap.set(extension, (currentCount ?? 0) + 1)
                    }
                }
                continue
            }
            totalBytes += fileSize

            const zipFolderPath = path.dirname(file.zipFilePath)
            zip.addLocalFile(file.fileUri.fsPath, zipFolderPath)
        }

        const iterator = ignoredExtensionMap.entries()

        for (let i = 0; i < ignoredExtensionMap.size; i++) {
            const nextValue = iterator.next().value
            if (nextValue) {
                const [key, value] = nextValue
                await amznTelemetry.amazonq_bundleExtensionIgnored.run(async (bundleSpan) => {
                    const event = {
                        filenameExt: key,
                        count: value,
                    }

                    bundleSpan.record(event)
                })
            }
        }

        telemetry.setRepositorySize(totalBytes)
        span.record({ amazonqRepositorySize: totalBytes })

        const zipFileBuffer = zip.toBuffer()
        return {
            zipFileBuffer,
            zipFileChecksum: getSha256(zipFileBuffer),
        }
    } catch (error) {
        getLogger().debug(`featureDev: Failed to prepare repo: ${error}`)
        if (error instanceof ToolkitError && error.code === 'ContentLengthError') {
            throw new ContentLengthError()
        }
        throw new PrepareRepoFailedError()
    }
}

/**
 * Gets the absolute path from a zip path.
 * @param {string} zipFilePath - The path in the zip file.
 * @param {{ [prefix: string]: vscode.WorkspaceFolder } | undefined} workspacesByPrefix - The workspaces with generated prefixes.
 * @param {CurrentWsFolders} workspaceFolders - All workspace folders.
 * @returns {{absolutePath: string, relativePath: string, workspaceFolder: vscode.WorkspaceFolder}} All possible path info.
 */
export function getPathsFromZipFilePath(
    zipFilePath: string,
    workspacesByPrefix: { [prefix: string]: vscode.WorkspaceFolder } | undefined,
    workspaceFolders: CurrentWsFolders
): {
    absolutePath: string
    relativePath: string
    workspaceFolder: vscode.WorkspaceFolder
} {
    // when there is just a single workspace folder, there is no prefixing
    if (workspacesByPrefix === undefined) {
        return {
            absolutePath: path.join(workspaceFolders[0].uri.fsPath, zipFilePath),
            relativePath: zipFilePath,
            workspaceFolder: workspaceFolders[0],
        }
    }
    // otherwise the first part of the zipPath is the prefix
    const prefix = zipFilePath.substring(0, zipFilePath.indexOf(path.sep))
    const workspaceFolder = workspacesByPrefix[prefix]
    if (workspaceFolder === undefined) {
        throw new ToolkitError(`Could not find workspace folder for prefix ${prefix}`)
    }
    return {
        absolutePath: path.join(workspaceFolder.uri.fsPath, zipFilePath.substring(prefix.length + 1)),
        relativePath: zipFilePath.substring(prefix.length + 1),
        workspaceFolder,
    }
}
