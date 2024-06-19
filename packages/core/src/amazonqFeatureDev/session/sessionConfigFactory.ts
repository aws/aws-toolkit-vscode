/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { featureDevScheme } from '../constants'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { VirtualMemoryFile } from '../../shared/virtualMemoryFile'
import { WorkspaceFolderNotFoundError } from '../errors'
import { CurrentWsFolders } from '../types'

export interface SessionConfig {
    // The paths on disk to where the source code lives
    workspaceRoots: string[]
    readonly fs: VirtualFileSystem
    readonly workspaceFolders: CurrentWsFolders
}

/**
 * Factory method for creating session configurations
 * @returns An instantiated SessionConfig, using either the arguments provided or the defaults
 */
export async function createSessionConfig(): Promise<SessionConfig> {
    const workspaceFolders = vscode.workspace.workspaceFolders
    const firstFolder = workspaceFolders?.[0]
    if (workspaceFolders === undefined || workspaceFolders.length === 0 || firstFolder === undefined) {
        throw new WorkspaceFolderNotFoundError()
    }

    const workspaceRoots = workspaceFolders.map(f => f.uri.fsPath)

    const fs = new VirtualFileSystem()

    // Register an empty featureDev file that's used when a new file is being added by the LLM
    fs.registerProvider(
        vscode.Uri.from({ scheme: featureDevScheme, path: 'empty' }),
        new VirtualMemoryFile(new Uint8Array())
    )

    return Promise.resolve({ workspaceRoots, fs, workspaceFolders: [firstFolder, ...workspaceFolders.slice(1)] })
}
