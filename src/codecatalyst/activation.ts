/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as uriHandlers from './uriHandlers'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ExtContext } from '../shared/extensions'
import { CodeCatalystRemoteSourceProvider } from './repos/remoteSourceProvider'
import { CodeCatalystCommands } from './commands'
import { GitExtension } from '../shared/extensions/git'
import { CodeCatalystAuthenticationProvider } from './auth'
import { registerDevfileWatcher } from './devfile'
import { DevEnvClient, DevEnvActivity } from '../shared/clients/devenvClient'
import { watchRestartingDevEnvs } from './reconnect'
import { PromptSettings } from '../shared/settings'
import { dontShow } from '../shared/localizedText'
import { getIdeProperties, isCloud9 } from '../shared/extensionUtilities'
import { Commands } from '../shared/vscode/commands2'
import { getCodeCatalystConfig } from '../shared/clients/codecatalystClient'
import { isDevenvVscode } from './utils'
import { getThisDevEnv } from './model'
import { getLogger } from '../shared/logger/logger'
import { InactivityMessage, shouldTrackUserActivity } from './devEnv'
import { AuthCommandDeclarations } from '../auth/commands'

const localize = nls.loadMessageBundle()

/**
 * Activate CodeCatalyst functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    const authProvider = CodeCatalystAuthenticationProvider.fromContext(ctx.extensionContext)
    const commands = new CodeCatalystCommands(authProvider)
    const remoteSourceProvider = new CodeCatalystRemoteSourceProvider(commands, authProvider)

    ctx.extensionContext.subscriptions.push(
        uriHandlers.register(ctx.uriHandler, CodeCatalystCommands.declared),
        ...Object.values(CodeCatalystCommands.declared).map(c => c.register(commands)),
        Commands.register('aws.codecatalyst.manageConnections', () => {
            AuthCommandDeclarations.instance.declared.showManageConnections.execute(
                'codecatalystDeveloperTools',
                'codecatalyst'
            )
        }),
        Commands.register('aws.codecatalyst.signout', () => {
            return authProvider.secondaryAuth.deleteConnection()
        })
    )

    if (!isCloud9()) {
        GitExtension.instance.registerRemoteSourceProvider(remoteSourceProvider).then(disposable => {
            ctx.extensionContext.subscriptions.push(disposable)
        })

        GitExtension.instance
            .registerCredentialsProvider({
                getCredentials(uri: vscode.Uri) {
                    if (uri.authority.endsWith(getCodeCatalystConfig().gitHostname)) {
                        return commands.withClient(client => authProvider.getCredentialsForGit(client))
                    }
                },
            })
            .then(disposable => ctx.extensionContext.subscriptions.push(disposable))

        watchRestartingDevEnvs(ctx, authProvider)
    }

    const thisDevenv = (await getThisDevEnv(authProvider))?.unwrapOrElse(err => {
        getLogger().warn('codecatalyst: failed to get current Dev Enviroment: %s', err)
        return undefined
    })

    if (!thisDevenv) {
        getLogger().verbose('codecatalyst: not a devenv, getThisDevEnv() returned empty')
    } else {
        ctx.extensionContext.subscriptions.push(DevEnvClient.instance)
        if (DevEnvClient.instance.id) {
            ctx.extensionContext.subscriptions.push(registerDevfileWatcher(DevEnvClient.instance))
        }

        getLogger().info('codecatalyst: Dev Environment ides=%O', thisDevenv?.summary.ides)
        if (!isCloud9() && thisDevenv && !isDevenvVscode(thisDevenv.summary.ides)) {
            // Prevent Toolkit from reconnecting to a "non-vscode" devenv by actively closing it.
            // Can happen if devenv is switched to ides="cloud9", etc.
            vscode.commands.executeCommand('workbench.action.remote.close')
            return
        }

        await showReadmeFileOnFirstLoad(ctx.extensionContext.workspaceState)

        const settings = PromptSettings.instance
        if (await settings.isPromptEnabled('remoteConnected')) {
            const message = localize(
                'AWS.codecatalyst.connectedMessage',
                'Welcome to your Amazon CodeCatalyst Dev Environment. For more options and information, view Dev Environment settings ({0} Extension > CodeCatalyst).',
                getIdeProperties().company
            )
            const openDevEnvSettings = localize('AWS.codecatalyst.openDevEnvSettings', 'Open Dev Environment Settings')
            vscode.window.showInformationMessage(message, dontShow, openDevEnvSettings).then(selection => {
                if (selection === dontShow) {
                    settings.disablePrompt('remoteConnected')
                } else if (selection === openDevEnvSettings) {
                    CodeCatalystCommands.declared.openDevEnvSettings.execute()
                }
            })
        }

        const maxInactivityMinutes = thisDevenv.summary.inactivityTimeoutMinutes
        const devEnvClient = thisDevenv.devenvClient
        const devEnvActivity = await DevEnvActivity.instanceIfActivityTrackingEnabled(devEnvClient)
        if (shouldTrackUserActivity(maxInactivityMinutes) && devEnvActivity) {
            const inactivityMessage = new InactivityMessage()
            inactivityMessage.setupMessage(maxInactivityMinutes, devEnvActivity)

            ctx.extensionContext.subscriptions.push(inactivityMessage, devEnvActivity)
        }
    }
}

async function showReadmeFileOnFirstLoad(workspaceState: vscode.ExtensionContext['workspaceState']): Promise<void> {
    if (isCloud9()) {
        return
    }

    getLogger().info('codecatalyst: showReadmeFileOnFirstLoad()')
    // Check dev env state to see if this is the first time the user has connected to a dev env
    const isFirstLoad = workspaceState.get('aws.codecatalyst.devEnv.isFirstLoad', true)

    if (!isFirstLoad) {
        getLogger().info('codecatalyst: is not first load, skipping showing README.md')
        return
    }

    // Determine expected readme file location
    const readmePath = `README.md`

    // Find readme file in workspace
    const readmeUri = await vscode.workspace.findFiles(readmePath).then(files => {
        if (files.length === 0) {
            return undefined
        }
        return files[0]
    })

    if (readmeUri === undefined) {
        getLogger().info(`codecatalyst: README.md not found in path '${readmePath}'`)
        return
    }

    // Show rendered readme file to user
    await vscode.commands.executeCommand('markdown.showPreview', readmeUri)

    await workspaceState.update('aws.codecatalyst.devEnv.isFirstLoad', false)
}
