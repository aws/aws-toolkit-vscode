/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { startLanguageServer } from './client'
import { AmazonQLspInstaller } from './lspInstaller'
import { lspSetupStage, ToolkitError, messages } from 'aws-core-vscode/shared'
import { LanguageClient } from 'vscode-languageclient'

let languageClient: LanguageClient | undefined

export async function activate(ctx: vscode.ExtensionContext) {
    try {
        await lspSetupStage('all', async () => {
            const installResult = await new AmazonQLspInstaller().resolve()
            languageClient = await lspSetupStage('launch', () => startLanguageServer(ctx, installResult.resourcePaths))
            return languageClient
        })
    } catch (err) {
        const e = err as ToolkitError
        void messages.showViewLogsMessage(`Failed to launch Amazon Q language server: ${e.message}`)
    }

    return languageClient
}
