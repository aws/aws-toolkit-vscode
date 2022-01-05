/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../shared/extensionGlobals'
import { ExtContext, VSCODE_EXTENSION_ID } from '../shared/extensions'
import { activateExtension } from '../shared/utilities/vsCodeUtils'
import * as cawsView from './cawsView'
import { GitExtension } from '../../types/git'
import { initCurrentRemoteSourceProvider } from './repos/remoteSourceProvider'
import { getLogger } from '../shared/logger/logger'
import { onCredentialsChanged } from './utils'
import { cloneCawsRepo, listCommands, login, logout, openCawsResource } from './commands'

/**
 * Activate CAWS functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    const viewProvider = new cawsView.CawsView()
    const view = vscode.window.createTreeView(viewProvider.viewId, {
        treeDataProvider: viewProvider,
        showCollapseAll: true,
    })

    globals.context.subscriptions.push(
        // vscode.window.registerTreeDataProvider(viewProvider.viewId, viewProvider),
        view,
        globals.awsContext.onDidChangeContext(async e => {
            onCredentialsChanged(ctx.extensionContext, viewProvider, view, e)
        })
    )

    // Git Extension handling
    activateExtension<GitExtension>(VSCODE_EXTENSION_ID.git).then(extension => {
        if (extension) {
            initCurrentRemoteSourceProvider(extension)
        } else {
            getLogger().warn('Git Extension could not be activated.')
        }
    })

    await registerCommands(ctx)
}

async function registerCommands(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.caws.connect', () => login(ctx, globals.caws)),
        vscode.commands.registerCommand('aws.caws.logout', () => logout(ctx, globals.caws)),
        vscode.commands.registerCommand('aws.caws.openOrg', () => openCawsResource('org')),
        vscode.commands.registerCommand('aws.caws.openProject', () => openCawsResource('project')),
        vscode.commands.registerCommand('aws.caws.openRepo', () => openCawsResource('repo')),
        vscode.commands.registerCommand('aws.caws.cloneRepo', () => cloneCawsRepo()),
        vscode.commands.registerCommand('aws.caws.listCommands', () => listCommands())
    )
}
