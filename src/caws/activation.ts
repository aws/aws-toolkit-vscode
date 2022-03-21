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
    createCommandDecorator,
    TryCommandDecorator,
} from './commands'
import * as uriHandlers from './uriHandlers'
import { DefaultSettingsConfiguration } from '../shared/settingsConfiguration'
import { CawsClient, createClient } from '../shared/clients/cawsClient'
import { GitExtension } from '../shared/extensions/git'
import { CawsAuthenticationProvider } from './auth'
import { initStatusbar } from './cawsStatusbar'

export function createClientFactory(authProvider: CawsAuthenticationProvider): () => Promise<CawsClient> {
    const settings = new DefaultSettingsConfiguration()

    return async () => {
        // Assumption: the current auth provider only supports being logged into a single account at a time
        // The VSC API can support multiple sessions, though we're probably a long way off from that
        // TODO: just hide the full API behind something a bit lighter
        const creds = authProvider.listSessions()[0]
        const client = await createClient(settings)

        if (creds) {
            await client.setCredentials(creds.accessDetails, creds.accountDetails.id)
        }

        return client
    }
}

/**
 * Activate CAWS functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    const authProvider = ctx.cawsAuthProvider
    const clientFactory = createClientFactory(authProvider)
    const tryCommand = createCommandDecorator(authProvider, clientFactory)

    const viewProvider = new cawsView.CawsView(clientFactory)
    const view = vscode.window.createTreeView(viewProvider.viewId, {
        treeDataProvider: viewProvider,
        showCollapseAll: true,
    })

    registerCommands(tryCommand, ctx)
    ctx.extensionContext.subscriptions.push(
        view,
        initStatusbar(authProvider),
        uriHandlers.register(ctx.uriHandler, tryCommand),
        authProvider.onDidChangeSessions(e => {
            const session = authProvider.listSessions()[0]

            view.title = session ? `CODE.AWS (${session.accountDetails.label})` : 'CODE.AWS'
            viewProvider.refresh()
        })
    )

    // Git Extension handling
    await initCurrentRemoteSourceProvider(authProvider, clientFactory, GitExtension.instance)

    // This function call could be placed inside `tryCommand`, though for now auto-connect and explicit
    // login flows are kept separate.
    await autoConnect(authProvider)
}

function registerCommands(tryCommand: TryCommandDecorator, ctx: ExtContext): void {
    const authProvider = ctx.cawsAuthProvider
    const clientFactory = createClientFactory(authProvider)

    const tryOpenCawsResource = tryCommand(openCawsResource)
    const tryCloneCawsResource = tryCommand(cloneCawsRepo)
    const tryCreateDevEnv = tryCommand(createDevEnv)

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
