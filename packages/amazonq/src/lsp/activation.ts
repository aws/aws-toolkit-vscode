/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { startLanguageServer } from './client'
import { AmazonQLspInstaller } from './lspInstaller'
import { lspSetupStage, ToolkitError, messages } from 'aws-core-vscode/shared'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'

export async function activate(ctx: vscode.ExtensionContext) {
    try {
        await lspSetupStage('all', async () => {
            const installResult = await new AmazonQLspInstaller().resolve()
            return await lspSetupStage('launch', () => startLanguageServer(ctx, installResult.resourcePaths))
        })
        await AuthUtil.instance.restore()
    } catch (err) {
        const e = err as ToolkitError
        void messages.showViewLogsMessage(`Failed to launch Amazon Q language server: ${e.message}`)
    }
}
