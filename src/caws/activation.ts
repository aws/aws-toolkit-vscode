/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import * as cawsView from './cawsView'
import { initCurrentRemoteSourceProvider } from './repos/remoteSourceProvider'
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
import { CawsAuthenticationProvider, CawsAuthStorage } from './auth'
import { initStatusbar } from './cawsStatusbar'
import { tryAutoConnect } from '../awsexplorer/activation'

/**
 * Activate CAWS functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    const sessionStorage = new CawsAuthStorage(ctx.extensionContext.globalState, ctx.extensionContext.secrets)
    const authProvider = CawsAuthenticationProvider.initialize(sessionStorage)
    const settings = new DefaultSettingsConfiguration()

    const clientFactory = async () => {
        // XXX: try to auto-connect with normal AWS credentials prior to creating a client
        // This should not be needed once we have the Bearer token
        await tryAutoConnect(ctx.awsContext)

        const creds = authProvider.listSessions()[0]
        const client = await createClient(settings)

        if (creds) {
            await client.setCredentials(creds.accountDetails.label, creds.accessDetails)
        }

        return client
    }

    const viewProvider = new cawsView.CawsView(clientFactory)
    const view = vscode.window.createTreeView(viewProvider.viewId, {
        treeDataProvider: viewProvider,
        showCollapseAll: true,
    })

    registerCommands(clientFactory, authProvider, ctx)
    ctx.extensionContext.subscriptions.push(
        view,
        initStatusbar(authProvider),
        uriHandlers.register(ctx.uriHandler, clientFactory),
        authProvider.onDidChangeSessions(e => {
            const session = authProvider.listSessions()[0]

            view.title = session ? `CODE.AWS (${session.accountDetails.label})` : 'CODE.AWS'
            viewProvider.refresh()
        })
    )

    // Git Extension handling
    await initCurrentRemoteSourceProvider(clientFactory, GitExtension.instance)

    // This function call could be placed inside `tryCommand`, though for now auto-connect and explicit
    // login flows are kept separate.
    await autoConnect(authProvider)
}

function registerCommands(
    clientFactory: CawsClientFactory,
    authProvider: CawsAuthenticationProvider,
    ctx: ExtContext
): void {
    const tryOpenCawsResource = tryCommand(clientFactory, openCawsResource)
    const tryCloneCawsResource = tryCommand(clientFactory, cloneCawsRepo)
    const tryCreateDevEnv = tryCommand(clientFactory, createDevEnv)

    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.caws.connect', async () => login(authProvider, await clientFactory())),
        vscode.commands.registerCommand('aws.caws.logout', () => logout(authProvider)),
        vscode.commands.registerCommand('aws.caws.openOrg', () => tryOpenCawsResource('org')),
        vscode.commands.registerCommand('aws.caws.openProject', () => tryOpenCawsResource('project')),
        vscode.commands.registerCommand('aws.caws.openRepo', () => tryOpenCawsResource('repo')),
        vscode.commands.registerCommand('aws.caws.openDevEnv', () => tryOpenCawsResource('env')),
        vscode.commands.registerCommand('aws.caws.cloneRepo', () => tryCloneCawsResource()),
        vscode.commands.registerCommand('aws.caws.listCommands', () => listCommands()),
        vscode.commands.registerCommand('aws.caws.createDevEnv', () => tryCreateDevEnv())
    )
}
