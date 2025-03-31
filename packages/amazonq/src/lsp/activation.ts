/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { startLanguageServer } from './client'
import { AmazonQLspInstaller } from './lspInstaller'
import { lspSetupStage, ToolkitError } from 'aws-core-vscode/shared'

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
    try {
        await lspSetupStage('all', async () => {
            const installResult = await new AmazonQLspInstaller().resolve()
            await lspSetupStage('launch', async () => await startLanguageServer(ctx, installResult.resourcePaths))
        })
        // Do not enable inline code path in LSP from 04/16 to 06/30.
        // Workspace context needs to use IDE inline completion code path for AB test
        // ctx.subscriptions.push(
        //     Commands.register({ id: 'aws.amazonq.invokeInlineCompletion', autoconnect: true }, async () => {
        //         await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
        //     }),
        //     vscode.workspace.onDidCloseTextDocument(async () => {
        //         await vscode.commands.executeCommand('aws.amazonq.rejectCodeSuggestion')
        //     })
        // )
    } catch (err) {
        const e = err as ToolkitError
        void vscode.window.showInformationMessage(`Unable to launch amazonq language server: ${e.message}`)
    }
}
