/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from '../logger'
import { isInDirectory } from '../filesystemUtilities'
import { dirnameWithTrailingSlash } from './pathUtils'

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
export async function addFolderToWorkspace(folder: { uri: vscode.Uri; name?: string }): Promise<boolean> {
    const disposables: vscode.Disposable[] = []
    const logger = getLogger()

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
        logger.error(`Unexpected error adding folder ${folder.uri.fsPath} to workspace`, err as Error)

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
 * @param findWorkspaceFiles Only used for tests
 */
export async function findParentProjectFile(
    sourceCodeUri: vscode.Uri,
    projectFile: string
): Promise<vscode.Uri | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceCodeUri)
    if (!workspaceFolder) {
        return undefined
    }

    const workspaceProjectFiles: vscode.Uri[] = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, path.join('**', projectFile))
    )

    // Use the project file "closest" in the parent chain to sourceCodeUri
    let parentProjectFiles = workspaceProjectFiles
        .filter(uri => {
            const dirname = dirnameWithTrailingSlash(uri.fsPath)

            return sourceCodeUri.fsPath.startsWith(dirname)
        })
        .sort((a, b) => {
            if (isInDirectory(path.parse(a.fsPath).dir, path.parse(b.fsPath).dir)) {
                return 1
            }

            return -1
        })

    return parentProjectFiles[0]
}
