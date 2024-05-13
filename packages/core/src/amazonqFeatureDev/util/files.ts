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
import { AmazonqCreateUpload, Metric } from '../../shared/telemetry/telemetry'
import { TelemetryHelper } from './telemetryHelper'
import { maxRepoSizeBytes } from '../constants'

const getSha256 = (file: Buffer) => createHash('sha256').update(file).digest('base64')

/**
 * given the root path of the repo it zips its files in memory and generates a checksum for it.
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
        for (const file of files) {
            const fileSize = (await vscode.workspace.fs.stat(file.fileUri)).size

            if (fileSize >= maxFileSizeBytes) {
                continue
            }
            totalBytes += fileSize

            const zipFolderPath = path.dirname(file.zipFilePath)
            zip.addLocalFile(file.fileUri.fsPath, zipFolderPath)
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
        if (error instanceof ContentLengthError) {
            throw error
        }
        throw new PrepareRepoFailedError()
    }
}

/**
 * gets the absolute path from a zip path
 * @param zipFilePath the path in the zip file
 * @param workspacesByPrefix the workspaces with generated prefixes
 * @param workspaceFolders all workspace folders
 * @returns all possible path info
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
