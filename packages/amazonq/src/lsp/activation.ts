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
    await new AmazonQLSPDownloader(serverPath, clientPath).tryInstallLsp()
    await startLanguageServer(ctx, path.join(serverPath, 'aws-lsp-codewhisperer.js'))
}
