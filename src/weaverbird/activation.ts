/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { registerChatView } from './vue/chat/backend'
import { VirtualFileSystem } from '../shared/virtualFilesystem'
import { getLogger } from '../shared/logger/logger'
import { weaverbirdScheme } from './constants'
import { VirtualMemoryFile } from '../shared/virtualMemoryFile'
import { PanelStore } from './stores/panelStore'
import { WeaverbirdDisplay } from './views/weaverbird-display'
import { v4 as uuid } from 'uuid'
import { getConfig } from './config'

/**
 * Activate Weaverbird functionality for the extension.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const fs = new VirtualFileSystem()

    // Register an empty weaverbird file that's used when a new file is being added by the LLM
    fs.registerProvider(
        vscode.Uri.from({ scheme: weaverbirdScheme, path: 'empty' }),
        new VirtualMemoryFile(new Uint8Array())
    )

    const localConfig = await getConfig()

    await registerChatView(context, localConfig, fs)
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
    context.subscriptions.push(textDocumentProvider)

    const panelStore = new PanelStore()

    const weaverbirdDisplay = new WeaverbirdDisplay(
        context,
        {
            panelStore,
        },
        localConfig,
        fs
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('Weaverbird.show', async () => {
            weaverbirdDisplay.show(uuid())
        })
    )
}
