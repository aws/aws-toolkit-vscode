/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { collectFiles, getWorkspaceFoldersByPrefixes } from '../../shared/utilities/workspaceUtils'

import { ContentLengthError, PrepareRepoFailedError } from '../../amazonqFeatureDev/errors'
import { getLogger } from '../../shared/logger/logger'
import { maxFileSizeBytes } from '../../amazonqFeatureDev/limits'
import { CurrentWsFolders, DeletedFileInfo, NewFileInfo, NewFileZipContents } from '../../amazonqDoc/types'
import { hasCode, ToolkitError } from '../../shared/errors'
import { AmazonqCreateUpload, Span, telemetry as amznTelemetry, telemetry } from '../../shared/telemetry/telemetry'
import { maxRepoSizeBytes } from '../../amazonqFeatureDev/constants'
import { isCodeFile } from '../../shared/filetypes'
import { fs } from '../../shared/fs/fs'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { VirtualMemoryFile } from '../../shared/virtualMemoryFile'
import { CodeWhispererSettings } from '../../codewhisperer/util/codewhispererSettings'
import { ZipStream } from '../../shared/utilities/zipStream'
import { isPresent } from '../../shared/utilities/collectionUtils'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { TelemetryHelper } from '../util/telemetryHelper'

export async function checkForDevFile(root: string) {
    const devFilePath = root + '/devfile.yaml'
    const hasDevFile = await fs.existsFile(devFilePath)
    return hasDevFile
}

/**
 * given the root path of the repo it zips its files in memory and generates a checksum for it.
 */
export async function prepareRepoData(
    repoRootPaths: string[],
    workspaceFolders: CurrentWsFolders,
    telemetry: TelemetryHelper,
    span: Span<AmazonqCreateUpload>,
    zip: ZipStream = new ZipStream()
) {
    try {
        const autoBuildSetting = CodeWhispererSettings.instance.getAutoBuildSetting()
        const useAutoBuildFeature = autoBuildSetting[repoRootPaths[0]] ?? false
        // We only respect gitignore file rules if useAutoBuildFeature is on, this is to avoid dropping necessary files for building the code (e.g. png files imported in js code)
        const files = await collectFiles(repoRootPaths, workspaceFolders, true, maxRepoSizeBytes, !useAutoBuildFeature)

        let totalBytes = 0
        const ignoredExtensionMap = new Map<string, number>()
        const addedFilePaths = new Set()

        for (const file of files) {
            if (addedFilePaths.has(file.zipFilePath)) {
                continue
            }
            addedFilePaths.add(file.zipFilePath)

            let fileSize
            try {
                fileSize = (await fs.stat(file.fileUri)).size
            } catch (error) {
                if (hasCode(error) && error.code === 'ENOENT') {
                    // No-op: Skip if file does not exist
                    continue
                }
                throw error
            }
            const isCodeFile_ = isCodeFile(file.relativeFilePath)
            const isDevFile = file.relativeFilePath === 'devfile.yaml'
            // When useAutoBuildFeature is on, only respect the gitignore rules filtered earlier and apply the size limit, otherwise, exclude all non code files and gitignore files
            const isNonCodeFileAndIgnored = useAutoBuildFeature ? false : !isCodeFile_ || isDevFile
            if (fileSize >= maxFileSizeBytes || isNonCodeFileAndIgnored) {
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

        const iterator = ignoredExtensionMap.entries()

        for (let i = 0; i < ignoredExtensionMap.size; i++) {
            const iteratorValue = iterator.next().value
            if (iteratorValue) {
                const [key, value] = iteratorValue
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
        const zipResult = await zip.finalize()

        const zipFileBuffer = zipResult.streamBuffer.getContents() || Buffer.from('')
        return {
            zipFileBuffer,
            zipFileChecksum: zipResult.hash,
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
    const workspaceFolder =
        workspacesByPrefix[prefix] ??
        (workspacesByPrefix[Object.values(workspacesByPrefix).find((val) => val.index === 0)?.name ?? ''] || undefined)
    if (workspaceFolder === undefined) {
        throw new ToolkitError(`Could not find workspace folder for prefix ${prefix}`)
    }
    return {
        absolutePath: path.join(workspaceFolder.uri.fsPath, zipFilePath.substring(prefix.length + 1)),
        relativePath: zipFilePath.substring(prefix.length + 1),
        workspaceFolder,
    }
}

export function getDeletedFileInfos(deletedFiles: string[], workspaceFolders: CurrentWsFolders): DeletedFileInfo[] {
    const workspaceFolderPrefixes = getWorkspaceFoldersByPrefixes(workspaceFolders)
    return deletedFiles
        .map((deletedFilePath) => {
            const prefix =
                workspaceFolderPrefixes === undefined
                    ? ''
                    : deletedFilePath.substring(0, deletedFilePath.indexOf(path.sep))
            const folder = workspaceFolderPrefixes === undefined ? workspaceFolders[0] : workspaceFolderPrefixes[prefix]
            if (folder === undefined) {
                getLogger().error(`No workspace folder found for file: ${deletedFilePath} and prefix: ${prefix}`)
                return undefined
            }
            const prefixLength = workspaceFolderPrefixes === undefined ? 0 : prefix.length + 1
            return {
                zipFilePath: deletedFilePath,
                workspaceFolder: folder,
                relativePath: deletedFilePath.substring(prefixLength),
                rejected: false,
                changeApplied: false,
            }
        })
        .filter(isPresent)
}

export function registerNewFiles(
    fs: VirtualFileSystem,
    newFileContents: NewFileZipContents[],
    uploadId: string,
    workspaceFolders: CurrentWsFolders,
    conversationId: string,
    scheme: string
): NewFileInfo[] {
    const result: NewFileInfo[] = []
    const workspaceFolderPrefixes = getWorkspaceFoldersByPrefixes(workspaceFolders)
    for (const { zipFilePath, fileContent } of newFileContents) {
        const encoder = new TextEncoder()
        const contents = encoder.encode(fileContent)
        const generationFilePath = path.join(uploadId, zipFilePath)
        const uri = vscode.Uri.from({ scheme, path: generationFilePath })
        fs.registerProvider(uri, new VirtualMemoryFile(contents))
        const prefix =
            workspaceFolderPrefixes === undefined ? '' : zipFilePath.substring(0, zipFilePath.indexOf(path.sep))
        const folder =
            workspaceFolderPrefixes === undefined
                ? workspaceFolders[0]
                : (workspaceFolderPrefixes[prefix] ??
                  workspaceFolderPrefixes[
                      Object.values(workspaceFolderPrefixes).find((val) => val.index === 0)?.name ?? ''
                  ])
        if (folder === undefined) {
            telemetry.toolkit_trackScenario.emit({
                count: 1,
                amazonqConversationId: conversationId,
                credentialStartUrl: AuthUtil.instance.startUrl,
                scenario: 'wsOrphanedDocuments',
            })
            getLogger().error(`No workspace folder found for file: ${zipFilePath} and prefix: ${prefix}`)
            continue
        }
        result.push({
            zipFilePath,
            fileContent,
            virtualMemoryUri: uri,
            workspaceFolder: folder,
            relativePath: zipFilePath.substring(
                workspaceFolderPrefixes === undefined ? 0 : prefix.length > 0 ? prefix.length + 1 : 0
            ),
            rejected: false,
            changeApplied: false,
        })
    }

    return result
}
