/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DefaultLambdaClient, LambdaClient } from '../../shared/clients/lambdaClient'
import { LLMConfig, LocalResolvedConfig } from '../types'
import { defaultLlmConfig, weaverbirdScheme } from '../constants'
import { getConfig } from '../config'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { VirtualMemoryFile } from '../../shared/virtualMemoryFile'
import { WorkspaceFolderNotFoundError } from '../errors'

export interface SessionConfig {
    readonly client: LambdaClient
    readonly llmConfig: LLMConfig
    readonly workspaceRoot: string
    readonly backendConfig: LocalResolvedConfig
    readonly fs: VirtualFileSystem
}

/**
 * Factory method for creating session configurations
 * @returns An instantiated SessionConfig, using either the arguments provided or the defaults
 */
export async function createSessionConfig(params?: {
    workspaceRoot?: string
    client?: LambdaClient
    llmConfiguration?: LLMConfig
    backendConfiguration?: LocalResolvedConfig
}): Promise<SessionConfig> {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (workspaceFolders === undefined || workspaceFolders.length === 0) {
        throw new WorkspaceFolderNotFoundError()
    }

    // TODO figure out how we want to handle multi root workspaces
    const workspace = params?.workspaceRoot ?? workspaceFolders[0].uri.fsPath
    const llmConfig = params?.llmConfiguration ?? defaultLlmConfig
    const backendConfig = params?.backendConfiguration ?? getConfig()
    const lambdaClient = params?.client ?? new DefaultLambdaClient(backendConfig.region)

    const fs = new VirtualFileSystem()

    // Register an empty weaverbird file that's used when a new file is being added by the LLM
    fs.registerProvider(
        vscode.Uri.from({ scheme: weaverbirdScheme, path: 'empty' }),
        new VirtualMemoryFile(new Uint8Array())
    )

    return {
        client: lambdaClient,
        llmConfig,
        workspaceRoot: workspace,
        backendConfig,
        fs,
    }
}
