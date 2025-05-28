/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import path from 'path'
import { startLanguageServer } from './client'
import { AmazonQResourcePaths } from './lspInstaller'
import { lspSetupStage, ToolkitError, messages } from 'aws-core-vscode/shared'

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
    try {
        await lspSetupStage('all', async () => {
            // Use local servers instead of downloading
            const resourcesPath = path.join(ctx.extensionPath, 'resources')
            // Define paths to local resources
            const resourcePaths: AmazonQResourcePaths = {
                lsp: path.join(resourcesPath, 'servers/aws-lsp-codewhisperer.js'),
                node: path.join(resourcesPath, 'servers/node'),
                ripGrep: path.join(resourcesPath, 'servers/ripgrep/rg'),
                ui: path.join(resourcesPath, 'clients/amazonq-ui.js'),
            }
            // Log paths for debugging
            // eslint-disable-next-line aws-toolkits/no-console-log
            console.log('Amazon Q Resource Paths:', {
                extensionPath: ctx.extensionPath,
                resourcesPath: resourcesPath,
                lsp: resourcePaths.lsp,
                node: resourcePaths.node,
                ripGrep: resourcePaths.ripGrep,
                ui: resourcePaths.ui,
            })

            await lspSetupStage('launch', async () => await startLanguageServer(ctx, resourcePaths))
        })
    } catch (err) {
        const e = err as ToolkitError
        void messages.showViewLogsMessage(`Failed to launch Amazon Q language server: ${e.message}`)
    }
}
