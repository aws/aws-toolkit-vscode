/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as pathutils from '../../shared/utilities/pathUtils'
import { getLogger } from '../logger'
import { isInDirectory } from '../filesystemUtilities'
import { normalizedDirnameWithTrailingSlash, normalize } from './pathUtils'
import globals from '../extensionGlobals'
import { ToolkitError } from '../errors'
import { SystemUtilities } from '../systemUtilities'
import { getGlobDirExcludedPatterns } from '../fs/watchedFiles'
import { sanitizeFilename } from './textUtilities'
import { GitIgnoreAcceptor } from '@gerhobbelt/gitignore-parser'
import * as parser from '@gerhobbelt/gitignore-parser'
import { fsCommon } from '../../srcShared/fs'

type GitIgnoreRelativeAcceptor = {
    folderPath: string
    acceptor: GitIgnoreAcceptor
}

export class GitIgnoreFilter {
    private acceptors: GitIgnoreRelativeAcceptor[]

    private constructor(acceptors: GitIgnoreRelativeAcceptor[]) {
        this.acceptors = acceptors
    }

    public static async build(gitIgnoreFiles: vscode.Uri[]): Promise<GitIgnoreFilter> {
        const acceptors: GitIgnoreRelativeAcceptor[] = []
        for (const file of gitIgnoreFiles) {
            const fileContent = await SystemUtilities.readFile(file)

            const folderPath = getWorkspaceParentDirectory(file.fsPath)
            if (folderPath === undefined) {
                continue
            }
            const gitIgnoreAcceptor = parser.compile(fileContent)
            acceptors.push({
                folderPath: folderPath,
                acceptor: gitIgnoreAcceptor,
            })
        }
        return new GitIgnoreFilter(acceptors)
    }

    public filterFiles(files: vscode.Uri[]) {
        return files.filter(file =>
            this.acceptors.every(acceptor => {
                if (!isInDirectory(acceptor.folderPath, file.fsPath)) {
                    // .gitignore file is responsible only for it's subfolders
                    return true
                }
                // careful with Windows, if ignore pattern is `build`
                // the library accepts `build\file.js`, but does not accept `build/file.js`
                const systemDependantRelativePath = path.relative(acceptor.folderPath, file.fsPath)
                const posixPath = systemDependantRelativePath.split(path.sep).join(path.posix.sep)
                return acceptor.acceptor.accepts(posixPath)
            })
        )
    }
}

export type CurrentWsFolders = [vscode.WorkspaceFolder, ...vscode.WorkspaceFolder[]]

/**
 * Resolves `relPath` against parent `workspaceFolder`, or returns `relPath` if
 * already absolute or the operation fails.
 */
export function tryGetAbsolutePath(folder: vscode.WorkspaceFolder | undefined, relPath: string): string {
    return path.resolve(folder?.uri ? folder.uri.fsPath + '/' : '', relPath)
}

/**
 * Encapsulates adding a folder to the VS Code Workspace.
 *
 * After the folder is added, this method waits until VS Code signals that the workspace has been updated.
 *
 * CALLER BEWARE: As of VS Code 1.36.00, any behavior that changes the first workspace folder causes VS Code to restart
 * in order to reopen the "workspace", which halts code and re-activates the extension. In this case, this function
 * will not return.
 *
 * Caller is responsible for validating whether or not the folder should be added to the workspace.
 *
 * @param folder - Folder to add to the VS Code Workspace
 *
 * @returns true if folder was added, false otherwise
 */
export async function addFolderToWorkspace(
    folder: { uri: vscode.Uri; name?: string },
    skipExisting?: boolean
): Promise<boolean> {
    const disposables: vscode.Disposable[] = []
    const logger = getLogger()

    if (skipExisting && vscode.workspace.getWorkspaceFolder(folder.uri)) {
        return true
    }

    try {
        // Wait for the WorkspaceFolders changed notification for the folder of interest before returning to caller
        return await new Promise<boolean>(resolve => {
            vscode.workspace.onDidChangeWorkspaceFolders(
                workspaceFoldersChanged => {
                    if (
                        workspaceFoldersChanged.added.some(addedFolder => addedFolder.uri.fsPath === folder.uri.fsPath)
                    ) {
                        resolve(true)
                    }
                },
                undefined,
                disposables
            )

            if (
                !vscode.workspace.updateWorkspaceFolders(
                    // Add new folder to the end of the list rather than the beginning, to avoid VS Code
                    // terminating and reinitializing our extension.
                    (vscode.workspace.workspaceFolders || []).length,
                    0,
                    folder
                )
            ) {
                resolve(false)
            }
        })
    } catch (err) {
        logger.error(`Unexpected error adding folder ${folder.uri.fsPath} to workspace: %O`, err as Error)

        return false
    } finally {
        for (const disposable of disposables) {
            disposable.dispose()
        }
    }
}

/**
 * Finds the closest file (specified by the search pattern) to the specified source file.
 * Checks parent directories up until the top level workspace folder for the source file.
 * Returns undefined if the file isn't found in any directories between the sourceCodeUri directory and the workspace folder
 * @param sourceCodeUri Source file to look upwards from
 * @param projectFile File to find in same folder or parent, up until the source file's top level workspace folder. Accepts wildcards.
 */
export async function findParentProjectFile(
    sourceCodeUri: vscode.Uri,
    projectFile: RegExp
): Promise<vscode.Uri | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceCodeUri)
    if (!workspaceFolder) {
        return undefined
    }

    const workspaceProjectFiles = globals.codelensRootRegistry.items
        .filter(item => item.item.match(projectFile))
        .map(item => item.path)

    // Use the project file "closest" in the parent chain to sourceCodeUri
    const parentProjectFiles = workspaceProjectFiles
        .filter(uri => {
            const dirname = normalizedDirnameWithTrailingSlash(uri)

            return normalize(sourceCodeUri.fsPath).startsWith(dirname)
        })
        .sort((a, b) => {
            if (isInDirectory(path.parse(a).dir, path.parse(b).dir)) {
                return 1
            }

            return -1
        })

    if (parentProjectFiles.length === 0) {
        return undefined
    }

    return vscode.Uri.file(parentProjectFiles[0])
}

/**
 * Finds the file specified by `filenameGlob` in the VSCode workspace, opens
 * it in an editor tab, returns it as a `TextDocument`.
 *
 * @returns `TextDocument`, or undefined if the file could not be found.
 */
export async function openTextDocument(filenameGlob: vscode.GlobPattern): Promise<vscode.TextDocument | undefined> {
    const found = await vscode.workspace.findFiles(filenameGlob)
    if (found.length === 0) {
        return undefined
    }
    await vscode.commands.executeCommand('vscode.open', found[0])
    const textDocument = vscode.workspace.textDocuments.find(o => o.uri.fsPath.includes(found[0].fsPath))
    return textDocument
}

/**
 * Returns a path relative to the first workspace folder found that is a parent of the defined path, along with the workspaceFolder itself
 * Returns undefined if there are no applicable workspace folders.
 * @param childPath Path to derive relative path from
 */
export function getWorkspaceRelativePath(
    childPath: string,
    override: {
        workspaceFolders?: readonly vscode.WorkspaceFolder[]
    } = {
        workspaceFolders: vscode.workspace.workspaceFolders,
    }
): { relativePath: string; workspaceFolder: vscode.WorkspaceFolder } | undefined {
    if (!override.workspaceFolders) {
        return
    }
    for (const folder of override.workspaceFolders) {
        if (isInDirectory(folder.uri.fsPath, childPath)) {
            return { relativePath: path.relative(folder.uri.fsPath, childPath), workspaceFolder: folder }
        }
    }
}

/**
 * Returns a path to the folder containing the file, if the file is in any of the workspaces
 * Returns undefined if there are no applicable workspace folders.
 * @param childPath Path to derive path from
 */
export function getWorkspaceParentDirectory(
    childPath: string,
    args: {
        workspaceFolders?: readonly vscode.WorkspaceFolder[]
    } = {
        workspaceFolders: vscode.workspace.workspaceFolders,
    }
): string | undefined {
    if (!args.workspaceFolders) {
        return
    }
    const parentFolder = path.dirname(childPath)
    for (const folder of args.workspaceFolders) {
        if (
            pathutils.areEqual(folder.uri.fsPath, folder.uri.fsPath, parentFolder) ||
            isInDirectory(folder.uri.fsPath, parentFolder)
        ) {
            return parentFolder
        }
    }
}

/**
 * This only checks text documents; the API does not expose webviews.
 */
export function checkUnsavedChanges(): boolean {
    return vscode.workspace.textDocuments.some(doc => doc.isDirty)
}

export function getExcludePattern(additionalPatterns: string[] = []) {
    const globAlwaysExcludedDirs = getGlobDirExcludedPatterns().map(pattern => `**/${pattern}/*`)
    const extraPatterns = [
        '**/package-lock.json',
        '**/yarn.lock',
        '**/*.zip',
        '**/*.tar.gz',
        '**/*.bin',
        '**/*.png',
        '**/*.jpg',
        '**/*.svg',
        '**/*.pyc',
        '**/*.pdf',
        '**/*.ttf',
        '**/*.ico',
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
async function filterOutGitignoredFiles(rootPath: string, files: vscode.Uri[]): Promise<vscode.Uri[]> {
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
    respectGitIgnore: boolean = true,
    maxSize = 200 * 1024 * 1024 // 200 MB,
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
        /**
         * collects all files that are marked as source
         * @param sourcePaths the paths where collection starts
         * @param workspaceFolders the current workspace folders opened
         * @param respectGitIgnore whether to respect gitignore file
         * @returns all matched files
         */
        if (prefix === undefined) {
            throw new ToolkitError(`Failed to find prefix for workspace folder ${folder.name}`)
        }
        return prefix === '' ? path : `${prefix}/${path}`
    }

    let totalSizeBytes = 0
    for (const rootPath of sourcePaths) {
        const allFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(rootPath, '**'),
            getExcludePattern()
        )
        const files = respectGitIgnore ? await filterOutGitignoredFiles(rootPath, allFiles) : allFiles

        for (const file of files) {
            const relativePath = getWorkspaceRelativePath(file.fsPath, { workspaceFolders })
            if (!relativePath) {
                continue
            }

            const fileStat = await fsCommon.stat(file)
            if (totalSizeBytes + fileStat.size > maxSize) {
                throw new ToolkitError(
                    'The project you have selected for source code is too large to use as context. Please select a different folder to use',
                    { code: 'ContentLengthError' }
                )
            }

            let fileContent = await readFile(file)

            if (fileContent === undefined) {
                continue
            }

            // Now that we've read the file, increase our usage
            totalSizeBytes += fileStat.size
            storage.push({
                workspaceFolder: relativePath.workspaceFolder,
                relativeFilePath: relativePath.relativePath,
                fileUri: file,
                fileContent: fileContent,
                zipFilePath: prefixWithFolderPrefix(relativePath.workspaceFolder, relativePath.relativePath),
            })
        }
    }
    return storage
}

const readFile = async (file: vscode.Uri) => {
    try {
        const fileContent = await SystemUtilities.readFile(file, new TextDecoder('utf8', { fatal: false }))
        return fileContent
    } catch (error) {
        getLogger().debug(
            `featureDev: Failed to read file ${file.fsPath} when collecting repository. Skipping the file`
        )
    }

    return undefined
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
 * collects all files that are marked as source
 * @param sourcePaths the paths where collection starts
 * @param workspaceFolders the current workspace folders opened
 * @param respectGitIgnore whether to respect gitignore file
 * @returns all matched files
 */
export async function collectFilesForIndex(
    sourcePaths: string[],
    workspaceFolders: CurrentWsFolders,
    respectGitIgnore: boolean = true,
    maxSize = 200 * 1024 * 1024 // 200 MB,
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

    const isLanguageSupported = (filename: string) => {
        const k =
            /\.(js|ts|java|py|rb|cpp|tsx|jsx|cc|c|h|html|json|css|md|php|swift|rs|scala|yaml|tf|sql|sh|go|yml|kt)$/i
        return k.test(filename)
    }

    let totalSizeBytes = 0
    for (const rootPath of sourcePaths) {
        const allFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(rootPath, '**'),
            getExcludePattern()
        )
        const files = respectGitIgnore ? await filterOutGitignoredFiles(rootPath, allFiles) : allFiles

        for (const file of files) {
            if (!isLanguageSupported(file.fsPath)) {
                continue
            }
            const relativePath = getWorkspaceRelativePath(file.fsPath, { workspaceFolders })
            if (!relativePath) {
                continue
            }

            const fileStat = await vscode.workspace.fs.stat(file)
            // ignore single file over 10 MB
            if (fileStat.size > 10 * 1024 * 1024) {
                continue
            }
            if (totalSizeBytes + fileStat.size > maxSize) {
                throw new ToolkitError(
                    'The project you have selected for source code is too large to use as context. Please select a different folder to use',
                    { code: 'ContentLengthError' }
                )
            }
            // Now that we've read the file, increase our usage
            totalSizeBytes += fileStat.size
            storage.push({
                workspaceFolder: relativePath.workspaceFolder,
                relativeFilePath: relativePath.relativePath,
                fileUri: file,
                fileContent: '',
                zipFilePath: '',
            })
        }
    }
    return storage
}
