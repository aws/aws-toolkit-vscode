/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DefaultLambdaClient, LambdaClient } from '../../shared/clients/lambdaClient'
import { LLMConfig, LocalResolvedConfig } from '../types'
import { SessionConfig } from './sessionConfig'
import { defaultLlmConfig, weaverbirdScheme } from '../constants'
import { getConfig } from '../config'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { VirtualMemoryFile } from '../../shared/virtualMemoryFile'
import { getLogger } from '../../shared/logger'
import globals from '../../shared/extensionGlobals'

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
        throw new Error('Could not find workspace folder')
    }

    // TODO figure out how we want to handle multi root workspaces
    const workspace = params?.workspaceRoot ?? workspaceFolders[0].uri.fsPath
    const llmConfig = params?.llmConfiguration ?? defaultLlmConfig
    const backendConfig = params?.backendConfiguration ?? (await getConfig())
    const lambdaClient = params?.client ?? new DefaultLambdaClient(backendConfig.region)

    const fs = new VirtualFileSystem()

    // Register an empty weaverbird file that's used when a new file is being added by the LLM
    fs.registerProvider(
        vscode.Uri.from({ scheme: weaverbirdScheme, path: 'empty' }),
        new VirtualMemoryFile(new Uint8Array())
    )

    const weaverbirdProvider = new (class implements vscode.TextDocumentContentProvider {
        async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
            try {
                const content = await fs.readFile(uri)
                const decodedContent = new TextDecoder().decode(content)
                return decodedContent
            } catch (e) {
                getLogger().error(`Unable to find: ${uri}`)
                return ''
            }
        }
    })()

    const textDocumentProvider = vscode.workspace.registerTextDocumentContentProvider(
        weaverbirdScheme,
        weaverbirdProvider
    )

    globals.context.subscriptions.push(textDocumentProvider)

    return new SessionConfig(lambdaClient, llmConfig, workspace, backendConfig, fs)
}
