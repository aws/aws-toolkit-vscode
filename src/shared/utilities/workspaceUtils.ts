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
 * Returns a path relative to the first workspace folder found that is a parent of the defined path.
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
): string | undefined {
    if (!override.workspaceFolders) {
        return
    }
    for (const folder of override.workspaceFolders) {
        if (isInDirectory(folder.uri.fsPath, childPath)) {
            return path.relative(folder.uri.fsPath, childPath)
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
