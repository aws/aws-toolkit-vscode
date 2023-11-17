/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { featureDevScheme } from '../constants'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { VirtualMemoryFile } from '../../shared/virtualMemoryFile'
import { SelectedFolderNotInWorkspaceFolderError, WorkspaceFolderNotFoundError } from '../errors'
import { getSourceCodePath } from '../util/files'

export interface SessionConfig {
    // The root workspace folder of where the source code lives
    readonly workspaceRoot: string
    // The path on disk to where the source code lives
    sourceRoot: string
    readonly fs: VirtualFileSystem
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

    const fs = new VirtualFileSystem()

    // Register an empty featureDev file that's used when a new file is being added by the LLM
    fs.registerProvider(
        vscode.Uri.from({ scheme: featureDevScheme, path: 'empty' }),
        new VirtualMemoryFile(new Uint8Array())
    )

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
        fs,
    })
}
