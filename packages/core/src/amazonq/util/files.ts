/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import {
    CollectFilesFilter,
    defaultExcludePatterns,
    getWorkspaceFoldersByPrefixes,
} from '../../shared/utilities/workspaceUtils'

import { PrepareRepoFailedError } from '../../amazonqFeatureDev/errors'
import { getLogger } from '../../shared/logger/logger'
import { maxFileSizeBytes } from '../../amazonqFeatureDev/limits'
import { CurrentWsFolders, DeletedFileInfo, NewFileInfo, NewFileZipContents } from '../../amazonqDoc/types'
import { ContentLengthError, ToolkitError } from '../../shared/errors'
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
import { zipProject } from './zipProjectUtil'

export const SvgFileExtension = '.svg'

export async function checkForDevFile(root: string) {
    const devFilePath = root + '/devfile.yaml'
    const hasDevFile = await fs.existsFile(devFilePath)
    return hasDevFile
}

function isInfraDiagramFile(relativePath: string) {
    return (
        relativePath.toLowerCase().endsWith(path.join('docs', 'infra.dot')) ||
        relativePath.toLowerCase().endsWith(path.join('docs', 'infra.svg'))
    )
}

function getFilterAndExcludePattern(useAutoBuildFeature: boolean, includeInfraDiagram: boolean) {
    // We only respect gitignore file rules if useAutoBuildFeature is on, this is to avoid dropping necessary files for building the code (e.g. png files imported in js code)
    if (useAutoBuildFeature) {
        return { excludePatterns: [], filterFn: undefined }
    }

    // ensure svg is not filtered out by files search
    const excludePatterns = includeInfraDiagram
        ? defaultExcludePatterns.filter((p) => !p.endsWith(SvgFileExtension))
        : defaultExcludePatterns

    // ensure only infra diagram is included from all svg files
    const filterFn: CollectFilesFilter | undefined = includeInfraDiagram
        ? (relativePath: string) =>
              relativePath.toLowerCase().endsWith(SvgFileExtension) && !isInfraDiagramFile(relativePath)
        : undefined

    return {
        filterFn,
        excludePatterns,
    }
}

async function emitIgnoredExtensionTelemetry(ignoredExtensionMap: Map<string, number>) {
    for (const [key, value] of ignoredExtensionMap) {
        await amznTelemetry.amazonq_bundleExtensionIgnored.run(async (bundleSpan) => {
            const event = {
                filenameExt: key,
                count: value,
            }

            bundleSpan.record(event)
        })
    }
}

export type PrepareRepoDataOptions = {
    telemetry?: TelemetryHelper
    zip?: ZipStream
    includeInfraDiagram?: boolean
    fileSizeByteLimit?: number // default to max
}

/**
 * given the root path of the repo it zips its files in memory and generates a checksum for it.
 */
export async function prepareRepoData(
    repoRootPaths: string[],
    workspaceFolders: CurrentWsFolders,
    span: Span<AmazonqCreateUpload>,
    options?: PrepareRepoDataOptions
) {
    try {
        const telemetry = options?.telemetry
        const includeInfraDiagram = options?.includeInfraDiagram ?? false
        const fileSizeByteLimit = options?.fileSizeByteLimit
            ? Math.min(options.fileSizeByteLimit, maxFileSizeBytes)
            : maxFileSizeBytes

        const autoBuildSetting = CodeWhispererSettings.instance.getAutoBuildSetting()
        const useAutoBuildFeature = autoBuildSetting[repoRootPaths[0]] ?? false
        const { excludePatterns, filterFn } = getFilterAndExcludePattern(useAutoBuildFeature, includeInfraDiagram)

        const ignoredExtensionMap = new Map<string, number>()
        const isExcluded = (relativeFilePath: string, fileSize: number) => {
            const isCodeFile_ = isCodeFile(relativeFilePath)
            const isDevFile = relativeFilePath === 'devfile.yaml'
            const isInfraDiagramFileExt = isInfraDiagramFile(relativeFilePath)

            let isExcludeFile = fileSize >= fileSizeByteLimit
            // When useAutoBuildFeature is on, only respect the gitignore rules filtered earlier and apply the size limit
            if (!isExcludeFile && !useAutoBuildFeature) {
                isExcludeFile = isDevFile || (!isCodeFile_ && (!includeInfraDiagram || !isInfraDiagramFileExt))
            }
            // Side-effect of isExcluded
            if (isExcludeFile) {
                if (!isCodeFile_) {
                    const re = /(?:\.([^.]+))?$/
                    const extensionArray = re.exec(relativeFilePath)
                    const extension = extensionArray?.length ? extensionArray[1] : undefined
                    if (extension) {
                        const currentCount = ignoredExtensionMap.get(extension)

                        ignoredExtensionMap.set(extension, (currentCount ?? 0) + 1)
                    }
                }
            }

            return isExcludeFile
        }

        const zipResult = await zipProject(
            repoRootPaths,
            workspaceFolders,
            {
                maxTotalSizeBytes: maxRepoSizeBytes,
                excludeByGitIgnore: true,
                excludePatterns: excludePatterns,
                filterFn: filterFn,
            },
            isExcluded,
            { zip: options?.zip ?? new ZipStream() }
        )

        await emitIgnoredExtensionTelemetry(ignoredExtensionMap)

        if (telemetry) {
            telemetry.setRepositorySize(zipResult.totalFileBytes)
        }

        span.record({ amazonqRepositorySize: zipResult.totalFileBytes })
        return zipResult
    } catch (error) {
        getLogger().debug(`Failed to prepare repo: ${error}`)
        if (error instanceof ToolkitError && error.code === 'ContentLengthError') {
            throw new ContentLengthError(error.message)
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
