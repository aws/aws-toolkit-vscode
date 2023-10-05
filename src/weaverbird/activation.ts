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
import { PanelIdNotFoundError, PanelNotFoundError, TabIdNotFoundError, TabNotFoundError } from './errors'

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
            const params = fromQueryToParameters(uri.query)
            const panelId = params.get('panelId')
            if (!panelId) {
                getLogger().error(`Unable to find panelId from ${uri.query}`)
                throw new PanelIdNotFoundError(uri.query)
            }

            const panel = panelStore.getPanel(panelId)
            if (!panel) {
                getLogger().error('Unable to find panel')
                throw new PanelNotFoundError()
            }

            const tabId = params.get('tabId')
            if (!tabId) {
                getLogger().error(`Unable to find tabId from ${uri.query}`)
                throw new TabIdNotFoundError(uri.query)
            }

            const tab = panelStore.getTab(panelId, tabId)
            if (!tab) {
                getLogger().error('Unable to find tab')
                throw new TabNotFoundError()
            }

            const content = await tab.session.config.fs.readFile(uri)
            const decodedContent = new TextDecoder().decode(content)
            return decodedContent
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
