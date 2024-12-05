/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { AmazonQLSPDownloader } from './download'

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
    const serverPath = ctx.asAbsolutePath('resources/qdeveloperserver')
    const clientPath = ctx.asAbsolutePath('resources/qdeveloperclient')
    await new AmazonQLSPDownloader(serverPath, clientPath).tryInstallLsp()

    /**
     * at this point the language server should be installed and available
     * at serverPath and mynah ui should be available and serveable at
     * clientPath
     *
     * TODO: actually hook up the language server
     */
}
