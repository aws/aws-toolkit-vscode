/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import path from 'path'
import { AmazonQLSPDownloader } from './download'
import { startLanguageServer } from './client'

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
    const serverPath = ctx.asAbsolutePath('resources/qdeveloperserver')
    const clientPath = ctx.asAbsolutePath('resources/qdeveloperclient')
    const installedAndReady = await new AmazonQLSPDownloader(serverPath, clientPath).tryInstallLsp()
    if (installedAndReady) {
        await startLanguageServer(
            ctx,
            process.env.AWS_LANGUAGE_SERVER_OVERRIDE ?? path.join(serverPath, 'aws-lsp-codewhisperer.js')
        )
    }
}
