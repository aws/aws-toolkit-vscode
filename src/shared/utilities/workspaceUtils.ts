/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from '../logger'

/**
 * Resolves `relPath` against parent `workspaceFolder`.
 *
 * Returns `relPath` if `relPath` is already absolute or the operation fails.
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
