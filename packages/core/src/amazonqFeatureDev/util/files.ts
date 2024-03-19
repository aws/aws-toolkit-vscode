/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { SystemUtilities } from '../../shared/systemUtilities'
import { getGlobDirExcludedPatterns } from '../../shared/fs/watchedFiles'
import { getWorkspaceRelativePath } from '../../shared/utilities/workspaceUtils'
import { Uri } from 'vscode'
import { GitIgnoreFilter } from './gitignore'

import AdmZip from 'adm-zip'
import { PrepareRepoFailedError } from '../errors'
import { getLogger } from '../../shared/logger/logger'
import { maxFileSizeBytes } from '../limits'
import { createHash } from 'crypto'
import { CurrentWsFolders } from '../types'
import { ToolkitError } from '../../shared/errors'
import { AmazonqCreateUpload, Metric } from '../../shared/telemetry/telemetry'
import { TelemetryHelper } from './telemetryHelper'
import { FileSystemCommon } from '../../srcShared/fs'
import { sanitizeFilename } from '../../shared/utilities/textUtilities'

export function getExcludePattern(additionalPatterns: string[] = []) {
    const globAlwaysExcludedDirs = getGlobDirExcludedPatterns().map(pattern => `**/${pattern}/*`)
    const extraPatterns = [
        '**/package-lock.json',
        '**/yarn.lock',
        '**/*.zip',
        '**/*.bin',
        '**/*.png',
        '**/*.jpg',
        '**/*.svg',
        '**/*.pyc',
        '**/license.txt',
        '**/License.txt',
        '**/LICENSE.txt',
        '**/license.md',
        '**/License.md',
        '**/LICENSE.md',
    ]
    const allPatterns = [...globAlwaysExcludedDirs, ...extraPatterns, ...additionalPatterns]
    return `{${allPatterns.join(',')}}`
}

/**
 * @param rootPath root folder to look for .gitignore files
 * @returns list of glob patterns extracted from .gitignore
 * These patterns are compatible with vscode exclude patterns
 */
async function filterOutGitignoredFiles(rootPath: string, files: Uri[]): Promise<Uri[]> {
    const gitIgnoreFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(rootPath, '**/.gitignore'),
        getExcludePattern()
    )
    const gitIgnoreFilter = await GitIgnoreFilter.build(gitIgnoreFiles)
    return gitIgnoreFilter.filterFiles(files)
}

/**
 * collects all files that are marked as source
 * @param sourcePaths the paths where collection starts
 * @param workspaceFolders the current workspace folders opened
 * @param respectGitIgnore whether to respect gitignore file
 * @returns all matched files
 */
export async function collectFiles(
    sourcePaths: string[],
    workspaceFolders: CurrentWsFolders,
    respectGitIgnore: boolean = true
): Promise<
    {
        workspaceFolder: vscode.WorkspaceFolder
        relativeFilePath: string
        fileUri: vscode.Uri
        fileContent: string
        zipFilePath: string
    }[]
> {
    const storage: Awaited<ReturnType<typeof collectFiles>> = []

    const workspaceFoldersMapping = getWorkspaceFoldersByPrefixes(workspaceFolders)
    const workspaceToPrefix = new Map<vscode.WorkspaceFolder, string>(
        workspaceFoldersMapping === undefined
            ? [[workspaceFolders[0], '']]
            : Object.entries(workspaceFoldersMapping).map(value => [value[1], value[0]])
    )
    const prefixWithFolderPrefix = (folder: vscode.WorkspaceFolder, path: string) => {
        const prefix = workspaceToPrefix.get(folder)
        if (prefix === undefined) {
            throw new ToolkitError(`Failed to find prefix for workspace folder ${folder.name}`)
        }
        return prefix === '' ? path : `${prefix}/${path}`
    }

    for (const rootPath of sourcePaths) {
        const allFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(rootPath, '**'),
            getExcludePattern()
        )
        const files = respectGitIgnore ? await filterOutGitignoredFiles(rootPath, allFiles) : allFiles

        for (const file of files) {
            try {
                const fileContent = await SystemUtilities.readFile(file, new TextDecoder('utf8', { fatal: true }))
                const relativePath = getWorkspaceRelativePath(file.fsPath, { workspaceFolders })

                if (relativePath) {
                    storage.push({
                        workspaceFolder: relativePath.workspaceFolder,
                        relativeFilePath: relativePath.relativePath,
                        fileUri: file,
                        fileContent: fileContent,
                        zipFilePath: prefixWithFolderPrefix(relativePath.workspaceFolder, relativePath.relativePath),
                    })
                }
            } catch (error) {
                getLogger().debug(
                    `featureDev: Failed to read file ${file.fsPath} when collecting repository: ${error}. Skipping the file`
                )
            }
        }
    }
    return storage
}

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
        const zip = new AdmZip()

        const files = await collectFiles(repoRootPaths, workspaceFolders, true)
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
        throw new PrepareRepoFailedError()
    }
}

const workspaceFolderPrefixGuards = {
    /**
     * the maximum number of subfolders the method below takes into account when calculating a prefix
     */
    maximumFolderDepthConsidered: 500,
    /**
     * the maximum suffix that can be added to a folder prefix in case of full subfolder path matches
     */
    maximumFoldersWithMatchingSubfolders: 10_000,
}

/**
 * tries to determine the possible prefixes we will use for a given workspace folder in the zip file
 * We want to keep the folder names in the prefix, since they might convey useful information, for example
 * If both folders are just called cdk (no name specified for the ws folder), adding a prefix of cdk1 and cdk2 is much less context, than having app_cdk and canaries_cdk
 *
 * Input:
 * - packages/app/cdk
 * - packages/canaries/cdk
 * Output:
 * - {'app_cdk': packages/app/cdk, 'canaries_cdk': packages/canaries/cdk}
 *
 * @returns an object where workspace folders have a prefix, or undefined for single root workspace, as there is no mapping needed there
 */
export function getWorkspaceFoldersByPrefixes(
    folders: CurrentWsFolders
): { [prefix: string]: vscode.WorkspaceFolder } | undefined {
    if (folders.length <= 1) {
        return undefined
    }
    let remainingWorkspaceFoldersToMap = folders.map(f => ({
        folder: f,
        preferredPrefixQueue: f.uri.fsPath
            .split(path.sep)
            .reverse()
            .slice(0, workspaceFolderPrefixGuards.maximumFolderDepthConsidered)
            .reduce(
                (candidates, subDir) => {
                    candidates.push(sanitizeFilename(path.join(subDir, candidates[candidates.length - 1])))
                    return candidates
                },
                [f.name]
            )
            .reverse(),
    }))
    const results: ReturnType<typeof getWorkspaceFoldersByPrefixes> = {}

    for (
        let addParentFolderCount = 0;
        remainingWorkspaceFoldersToMap.length > 0 &&
        addParentFolderCount < workspaceFolderPrefixGuards.maximumFolderDepthConsidered;
        addParentFolderCount++
    ) {
        const workspacesByPrefixes = remainingWorkspaceFoldersToMap.reduce((acc, wsFolder) => {
            const prefix = wsFolder.preferredPrefixQueue.pop()
            // this should never happen, as last candidates should be handled below, and the array starts non empty
            if (prefix === undefined) {
                throw new ToolkitError(
                    `Encountered a folder with invalid prefix candidates (workspace folder ${wsFolder.folder.name})`
                )
            }
            acc[prefix] = acc[prefix] ?? []
            acc[prefix].push(wsFolder)
            return acc
        }, {} as { [key: string]: (typeof remainingWorkspaceFoldersToMap)[0][] })
        remainingWorkspaceFoldersToMap = []
        for (const [prefix, folders] of Object.entries(workspacesByPrefixes)) {
            // if a folder has a unique prefix
            if (folders.length === 1 && results[prefix] === undefined) {
                results[prefix] = folders[0].folder
                continue
            }

            // find the folders that do not have more parents
            const foldersToSuffix: typeof folders = []
            for (const folder of folders) {
                if (folder.preferredPrefixQueue.length > 0) {
                    remainingWorkspaceFoldersToMap.push(folder)
                } else {
                    foldersToSuffix.push(folder)
                }
            }
            // for these last resort folders, suffix them with an increasing number until unique
            if (foldersToSuffix.length === 1 && results[prefix] === undefined) {
                results[prefix] = foldersToSuffix[0].folder
            } else {
                let suffix = 1
                for (const folder of foldersToSuffix) {
                    let newPrefix: string
                    let safetyCounter = 0
                    do {
                        newPrefix = `${prefix}_${suffix}`
                        suffix++
                        safetyCounter++
                    } while (
                        results[newPrefix] !== undefined &&
                        safetyCounter < workspaceFolderPrefixGuards.maximumFoldersWithMatchingSubfolders
                    )
                    if (safetyCounter >= workspaceFolderPrefixGuards.maximumFoldersWithMatchingSubfolders) {
                        throw new ToolkitError(
                            `Could not find a unique prefix for workspace folder ${folder.folder.name} in zip file.`
                        )
                    }
                    results[newPrefix] = folder.folder
                }
            }
        }
    }
    if (remainingWorkspaceFoldersToMap.length > 0) {
        throw new ToolkitError(
            `Could not find a unique prefix for workspace folder ${remainingWorkspaceFoldersToMap[0].folder.name} in zip file.`
        )
    }

    return results
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

export async function getSourceCodePath(workspaceRoot: string, projectRoot: string) {
    const srcRoot = path.join(workspaceRoot, projectRoot)
    try {
        const srcFound = await FileSystemCommon.instance.stat(srcRoot)
        return srcFound !== undefined ? srcRoot : workspaceRoot
    } catch (error) {
        if ((error as { code: string }).code === 'FileNotFound') {
            return workspaceRoot
        }
        throw error
    }
}
