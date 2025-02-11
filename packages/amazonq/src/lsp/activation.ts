/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { startLanguageServer } from './client'
import { AmazonQLSPResolver } from './lspInstaller'
import { Commands, lspSetupStage, ToolkitError } from 'aws-core-vscode/shared'

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
    try {
        await lspSetupStage('all', async () => {
            const installResult = await new AmazonQLSPResolver().resolve()
            await lspSetupStage('launch', async () => await startLanguageServer(ctx, installResult.resourcePaths))
        })
        ctx.subscriptions.push(
            Commands.register({ id: 'aws.amazonq.invokeInlineCompletion', autoconnect: true }, async () => {
                await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
            }),
            Commands.declare('aws.amazonq.rejectCodeSuggestion', () => async () => {
                await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')
            }).register()
        )
    } catch (err) {
        const e = err as ToolkitError
        void vscode.window.showInformationMessage(`Unable to launch amazonq language server: ${e.message}`)
    }
}
