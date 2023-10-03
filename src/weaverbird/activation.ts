/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { PanelStore } from './stores/panelStore'
import { WeaverbirdDisplay } from './views/weaverbird-display'
import { v4 as uuid } from 'uuid'
import { weaverbirdScheme } from './constants'
import { getLogger } from '../shared/logger'
import { fromQueryToParameters } from '../shared/utilities/uriUtils'

/**
 * Activate Weaverbird functionality for the extension.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const panelStore = new PanelStore()

    const weaverbirdDisplay = new WeaverbirdDisplay(context, {
        panelStore,
    })

    const weaverbirdProvider = new (class implements vscode.TextDocumentContentProvider {
        async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
            try {
                const params = fromQueryToParameters(uri.query)
                const panelId = params.get('panelId')
                if (!panelId) {
                    getLogger().error(`Unable to find panelId from ${uri.query}`)
                    return ''
                }

                const panel = panelStore.getPanel(panelId)
                if (!panel) {
                    getLogger().error('Unable to find panel')
                    return ''
                }

                const content = await panel.fs.readFile(uri)
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

    context.subscriptions.push(
        vscode.commands.registerCommand('Weaverbird.show', async () => {
            await weaverbirdDisplay.show(uuid())
        })
    )
}
