/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { startLanguageServer } from './client'
import { AmazonQLSPResolver } from './lspInstaller'
import { ToolkitError } from 'aws-core-vscode/shared'

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
    try {
        const installResult = await new AmazonQLSPResolver().resolve()
        await startLanguageServer(ctx, installResult.executablePaths)
    } catch (err) {
        const e = err as ToolkitError
        void vscode.window.showInformationMessage(`Unable to launch amazonq language server: ${e.message}`)
    }
}
