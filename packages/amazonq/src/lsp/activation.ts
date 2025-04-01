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
    } catch (err) {
        const e = err as ToolkitError
        void vscode.window.showInformationMessage(`Unable to launch amazonq language server: ${e.message}`)
    }
}
