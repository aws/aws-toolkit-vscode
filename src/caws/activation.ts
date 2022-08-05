/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as uriHandlers from './uriHandlers'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ExtContext } from '../shared/extensions'
import { CawsRemoteSourceProvider } from './repos/remoteSourceProvider'
import { CawsCommands } from './commands'
import { GitExtension } from '../shared/extensions/git'
import { initStatusbar } from './cawsStatusbar'
import { CawsAuthenticationProvider } from './auth'
import { registerDevfileWatcher } from './devfile'
import { DevelopmentWorkspaceClient } from '../shared/clients/developmentWorkspaceClient'
import { watchRestartingWorkspaces } from './reconnect'
import { getCawsWorkspaceArn } from '../shared/vscode/env'
import { PromptSettings } from '../shared/settings'
import { dontShow } from '../shared/localizedText'
import { isCloud9 } from '../shared/extensionUtilities'

const localize = nls.loadMessageBundle()

/**
 * Activate CAWS functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    const authProvider = CawsAuthenticationProvider.fromContext(ctx.extensionContext)
    const commands = new CawsCommands(authProvider)
    const remoteSourceProvider = new CawsRemoteSourceProvider(commands, authProvider)

    ctx.extensionContext.subscriptions.push(
        initStatusbar(authProvider),
        uriHandlers.register(ctx.uriHandler, CawsCommands.declared),
        ...Object.values(CawsCommands.declared).map(c => c.register(commands))
    )

    GitExtension.instance.registerRemoteSourceProvider(remoteSourceProvider).then(disposable => {
        ctx.extensionContext.subscriptions.push(disposable)
    })

    if (!isCloud9()) {
        watchRestartingWorkspaces(ctx, authProvider)
    }

    const workspaceClient = new DevelopmentWorkspaceClient()
    if (workspaceClient.arn) {
        ctx.extensionContext.subscriptions.push(registerDevfileWatcher(workspaceClient))
    }

    const settings = PromptSettings.instance
    if (getCawsWorkspaceArn()) {
        if (await settings.isPromptEnabled('remoteConnected')) {
            const message = localize(
                'AWS.caws.connectedMessage',
                'Welcome to your REMOVED.codes Workspace. For more options and information, view Workspace settings (AWS Extension > REMOVED.codes).'
            )
            const openWorkspaceSettings = localize('AWS.caws.openWorkspaceSettings', 'Open Workspace Settings')
            vscode.window.showInformationMessage(message, dontShow, openWorkspaceSettings).then(selection => {
                if (selection === dontShow) {
                    settings.disablePrompt('remoteConnected')
                } else if (selection === openWorkspaceSettings) {
                    CawsCommands.declared.openWorkspaceSettings.execute()
                }
            })
        }
    }
}
