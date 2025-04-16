/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { clientId, encryptionKey, startLanguageServer } from './client'
import { AmazonQLspInstaller } from './lspInstaller'
import { lspSetupStage, ToolkitError } from 'aws-core-vscode/shared'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { auth2 } from 'aws-core-vscode/auth'

export async function activate(ctx: vscode.ExtensionContext) {
    try {
        const client = await lspSetupStage('all', async () => {
            const installResult = await new AmazonQLspInstaller().resolve()
            return await lspSetupStage('launch', () => startLanguageServer(ctx, installResult.resourcePaths))
        })
        AuthUtil.create(new auth2.LanguageClientAuth(client, clientId, encryptionKey))
        await AuthUtil.instance.restore()
    } catch (err) {
        const e = err as ToolkitError
        void vscode.window.showInformationMessage(`Unable to launch amazonq language server: ${e.message}`)
    }
}
