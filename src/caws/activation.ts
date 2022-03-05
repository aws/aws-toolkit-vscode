/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../shared/extensionGlobals'
import { ExtContext } from '../shared/extensions'
import * as cawsView from './cawsView'
import { initCurrentRemoteSourceProvider } from './repos/remoteSourceProvider'
import { onCredentialsChanged } from './utils'
import {
    autoConnect,
    cloneCawsRepo,
    createDevEnv,
    listCommands,
    login,
    logout,
    openCawsResource,
    tryCommand,
} from './commands'
import * as uriHandlers from './uriHandlers'
import { DefaultSettingsConfiguration } from '../shared/settingsConfiguration'
import { CawsClientFactory, createClient } from '../shared/clients/cawsClient'
import { GitExtension } from '../shared/extensions/git'

/**
 * Activate CAWS functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    const settings = new DefaultSettingsConfiguration()
    const clientFactory = async () => {
        // The current assumption is that `awsContext` only changes for valid credentials
        // so we won't bother to check twice. However, this ignores the scenario of expired
        // credentials. We will defer this case until OIDC auth is implemented.
        const creds = ctx.awsContext.getCawsCredentials()
        const client = await createClient(settings)

        if (creds) {
            await client.setCredentials(creds.username, creds.secret)
        }

        return client
    }

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

    registerCommands(clientFactory, ctx)

    // Git Extension handling
    await initCurrentRemoteSourceProvider(clientFactory, GitExtension.instance)

    // This function call could be placed inside `tryCommand`, though for now auto-connect and explicit
    // login flows are kept separate.
    await autoConnect(ctx.extensionContext, ctx.awsContext, await clientFactory())
}

function registerCommands(clientFactory: CawsClientFactory, ctx: ExtContext): void {
    const tryOpenCawsResource = tryCommand(clientFactory, openCawsResource)
    const tryCloneCawsResource = tryCommand(clientFactory, cloneCawsRepo)
    const tryCreateDevEnv = tryCommand(clientFactory, createDevEnv)

    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.caws.connect', async () =>
            login(ctx.extensionContext, ctx.awsContext, await clientFactory())
        ),
        vscode.commands.registerCommand('aws.caws.logout', () => logout(ctx)),
        vscode.commands.registerCommand('aws.caws.openOrg', () => tryOpenCawsResource('org')),
        vscode.commands.registerCommand('aws.caws.openProject', () => tryOpenCawsResource('project')),
        vscode.commands.registerCommand('aws.caws.openRepo', () => tryOpenCawsResource('repo')),
        vscode.commands.registerCommand('aws.caws.openDevEnv', () => tryOpenCawsResource('env')),
        vscode.commands.registerCommand('aws.caws.cloneRepo', () => tryCloneCawsResource()),
        vscode.commands.registerCommand('aws.caws.listCommands', () => listCommands()),
        vscode.commands.registerCommand('aws.caws.createDevEnv', () => tryCreateDevEnv()),
        uriHandlers.register(ctx.uriHandler, clientFactory)
    )
}
