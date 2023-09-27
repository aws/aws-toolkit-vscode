/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { PanelStore } from './stores/panelStore'
import { WeaverbirdDisplay } from './views/weaverbird-display'
import { v4 as uuid } from 'uuid'

/**
 * Activate Weaverbird functionality for the extension.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const panelStore = new PanelStore()

    const weaverbirdDisplay = new WeaverbirdDisplay(context, {
        panelStore,
    })

    context.subscriptions.push(
        vscode.commands.registerCommand('Weaverbird.show', async () => {
            await weaverbirdDisplay.show(uuid())
        })
    )
}
