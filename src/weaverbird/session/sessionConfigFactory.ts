/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { weaverbirdScheme } from '../constants'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { VirtualMemoryFile } from '../../shared/virtualMemoryFile'
import { WorkspaceFolderNotFoundError } from '../errors'
import { getSourceCodePath } from '../util/files'

export interface SessionConfig {
    workspaceRoot: string
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

    const defaultWorkspaceRoot = await getSourceCodePath(workspaceFolders[0].uri.fsPath, '/src')

    const fs = new VirtualFileSystem()

    // Register an empty weaverbird file that's used when a new file is being added by the LLM
    fs.registerProvider(
        vscode.Uri.from({ scheme: weaverbirdScheme, path: 'empty' }),
        new VirtualMemoryFile(new Uint8Array())
    )

    return {
        workspaceRoot: defaultWorkspaceRoot,
        fs,
    }
}
