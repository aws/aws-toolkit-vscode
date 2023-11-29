/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SelectedFolderNotInWorkspaceFolderError, WorkspaceFolderNotFoundError } from '../errors'
import { getSourceCodePath } from '../util/files'

export interface SessionConfig {
    // The root workspace folder of where the source code lives
    readonly workspaceRoot: string
    // The path on disk to where the source code lives
    sourceRoot: string
}

/**
 * Factory method for creating session configurations
 * @returns An instantiated SessionConfig, using either the arguments provided or the defaults
 */
export async function createSessionConfig(): Promise<SessionConfig> {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (workspaceFolders === undefined || workspaceFolders.length === 0) {
        throw new WorkspaceFolderNotFoundError()
    }

    let workspaceRoot = workspaceFolders[0].uri.fsPath
    let sourceRoot = await getSourceCodePath(workspaceRoot, 'src')

    return Promise.resolve({
        set sourceRoot(newSourceRoot: string) {
            sourceRoot = newSourceRoot

            const possibleWorkspaceRoot = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(sourceRoot))
            if (!possibleWorkspaceRoot) {
                throw new SelectedFolderNotInWorkspaceFolderError()
            }
            workspaceRoot = possibleWorkspaceRoot.uri.fsPath
        },
        get sourceRoot(): string {
            return sourceRoot
        },
        get workspaceRoot(): string {
            return workspaceRoot
        },
    })
}
