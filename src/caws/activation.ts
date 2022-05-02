/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as uriHandlers from './uriHandlers'
import { ExtContext } from '../shared/extensions'
import { CawsRemoteSourceProvider } from './repos/remoteSourceProvider'
import { autoConnect, CawsCommands } from './commands'
import { GitExtension } from '../shared/extensions/git'
import { initStatusbar } from './cawsStatusbar'
import { CawsAuthenticationProvider } from './auth'
import { DeveloperToolsView } from './explorer'

/**
 * Activate CAWS functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    const authProvider = CawsAuthenticationProvider.fromContext(ctx.extensionContext)
    const commands = new CawsCommands(authProvider)
    const developerTools = new DeveloperToolsView(authProvider)
    const remoteSourceProvider = new CawsRemoteSourceProvider(authProvider)

    ctx.extensionContext.subscriptions.push(
        initStatusbar(authProvider),
        uriHandlers.register(ctx.uriHandler, commands),
        vscode.window.registerTreeDataProvider(DeveloperToolsView.viewId, developerTools),
        ...Object.values(CawsCommands.declared).map(c => c.register(commands))
    )

    GitExtension.instance.registerRemoteSourceProvider(remoteSourceProvider).then(disposable => {
        ctx.extensionContext.subscriptions.push(disposable)
    })

    // This function call could be placed inside `injectClient`, though for now auto-connect and explicit
    // login flows are kept separate.
    await autoConnect(authProvider)
}
