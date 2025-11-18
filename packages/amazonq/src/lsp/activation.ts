/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { startLanguageServer } from './client'
import { AmazonQLspInstaller, getBundledResourcePaths } from './lspInstaller'
import { lspSetupStage, ToolkitError, messages, getLogger } from 'aws-core-vscode/shared'
import { getAmazonQLspConfig } from './config'

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
    const config = getAmazonQLspConfig()
    const registryUrl = config.registryUrl

    try {
        await lspSetupStage('all', async () => {
            const installResult = await new AmazonQLspInstaller().resolve()
            await lspSetupStage(
                'launch',
                async () => await startLanguageServer(ctx, installResult.resourcePaths, registryUrl)
            )
        })
    } catch (err) {
        const e = err as ToolkitError
        getLogger('amazonqLsp').warn(`Failed to start downloaded LSP, falling back to bundled LSP: ${e.message}`)
        try {
            await lspSetupStage('all', async () => {
                await lspSetupStage(
                    'launch',
                    async () => await startLanguageServer(ctx, getBundledResourcePaths(ctx), registryUrl)
                )
            })
        } catch (error) {
            void messages.showViewLogsMessage(
                `Failed to launch Amazon Q language server: ${(error as ToolkitError).message}`
            )
        }
    }
}
