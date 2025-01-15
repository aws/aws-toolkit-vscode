/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as uriHandlers from './uriHandlers'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ExtContext } from '../shared/extensions'
import { CodeCatalystRemoteSourceProvider } from './repos/remoteSourceProvider'
import { CodeCatalystCommands, codecatalystConnectionsCmd } from './commands'
import { GitExtension } from '../shared/extensions/git'
import { CodeCatalystAuthenticationProvider } from './auth'
import { registerDevfileWatcher, updateDevfileCommand } from './devfile'
import { DevEnvClient } from '../shared/clients/devenvClient'
import { watchRestartingDevEnvs } from './reconnect'
import { ToolkitPromptSettings } from '../shared/settings'
import { dontShow } from '../shared/localizedText'
import { getIdeProperties, isCloud9 } from '../shared/extensionUtilities'
import { Commands } from '../shared/vscode/commands2'
import { getCodeCatalystConfig } from '../shared/clients/codecatalystClient'
import { isDevenvVscode } from './utils'
import { codeCatalystConnectCommand, getThisDevEnv } from './model'
import { getLogger } from '../shared/logger/logger'
import { DevEnvActivityStarter } from './devEnv'
import { learnMoreCommand, onboardCommand, reauth } from './explorer'
import { isInDevEnv } from '../shared/vscode/env'
import { hasScopes, scopesCodeWhispererCore, getTelemetryMetadataForConn } from '../auth/connection'
import { telemetry } from '../shared/telemetry/telemetry'
import { asStringifiedStack } from '../shared/telemetry/spans'

const localize = nls.loadMessageBundle()

/**
 * Activate CodeCatalyst functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    const authProvider = CodeCatalystAuthenticationProvider.fromContext(ctx.extensionContext)
    const commands = new CodeCatalystCommands(authProvider)
    const remoteSourceProvider = new CodeCatalystRemoteSourceProvider(commands, authProvider)

    codeCatalystConnectCommand.register()
    reauth.register()
    onboardCommand.register()
    updateDevfileCommand.register()
    learnMoreCommand.register()

    await authProvider.restore()

    // Forget Amazon Q connections while we transition to separate auth sessions per extension.
    // Note: credentials on disk in the dev env cannot have Q scopes, so it will never be forgotten.
    // TODO: Remove after some time?
    if (authProvider.isConnected() && hasScopes(authProvider.activeConnection!, scopesCodeWhispererCore)) {
        await telemetry.function_call.run(
            async () => {
                await telemetry.auth_modifyConnection.run(async () => {
                    const conn = authProvider.activeConnection
                    telemetry.record({
                        action: 'forget',
                        source: asStringifiedStack(telemetry.getFunctionStack()),
                        connectionState: conn ? authProvider.auth.getConnectionState(conn) : undefined,
                        ...(await getTelemetryMetadataForConn(conn)),
                    })

                    await authProvider.secondaryAuth.forgetConnection()
                })
            },
            { emit: false, functionId: { name: 'activate', class: 'CodeCatalyst' } }
        )
    }

    ctx.extensionContext.subscriptions.push(
        uriHandlers.register(ctx.uriHandler, CodeCatalystCommands.declared),
        ...Object.values(CodeCatalystCommands.declared).map((c) => c.register(commands)),
        codecatalystConnectionsCmd.register(),
        Commands.register('aws.codecatalyst.signout', () => {
            return authProvider.secondaryAuth.deleteConnection()
        })
    )

    if (!isCloud9()) {
        await GitExtension.instance.registerRemoteSourceProvider(remoteSourceProvider).then((disposable) => {
            ctx.extensionContext.subscriptions.push(disposable)
        })

        await GitExtension.instance
            .registerCredentialsProvider({
                getCredentials(uri: vscode.Uri) {
                    if (uri.authority.endsWith(getCodeCatalystConfig().gitHostname)) {
                        return commands.withClient((client) => authProvider.getCredentialsForGit(client))
                    }
                },
            })
            .then((disposable) => ctx.extensionContext.subscriptions.push(disposable))

        watchRestartingDevEnvs(ctx, authProvider)
    }

    const thisDevenv = (await getThisDevEnv(authProvider))?.unwrapOrElse((err) => {
        getLogger().error('codecatalyst: failed to get current Dev Enviroment: %s', err)
        return undefined
    })

    if (!thisDevenv) {
        if (isInDevEnv()) {
            getLogger().info('codecatalyst: Dev Environment timeout=unknown')
        } else {
            getLogger().verbose('codecatalyst: not a Dev Environment ($__DEV_ENVIRONMENT_ID is undefined)')
        }
    } else {
        ctx.extensionContext.subscriptions.push(DevEnvClient.instance)
        if (DevEnvClient.instance.id) {
            ctx.extensionContext.subscriptions.push(registerDevfileWatcher(DevEnvClient.instance))
        }

        const timeoutMin = thisDevenv.summary.inactivityTimeoutMinutes
        const timeout = timeoutMin === 0 ? 'never' : `${timeoutMin} min`
        getLogger().info('codecatalyst: Dev Environment timeout=%s, ides=%O', timeout, thisDevenv.summary.ides)
        if (!isCloud9() && thisDevenv && !isDevenvVscode(thisDevenv.summary.ides)) {
            // Prevent Toolkit from reconnecting to a "non-vscode" devenv by actively closing it.
            // Can happen if devenv is switched to ides="cloud9", etc.
            void vscode.commands.executeCommand('workbench.action.remote.close')
            return
        }

        await showReadmeFileOnFirstLoad(ctx.extensionContext.workspaceState)

        const settings = ToolkitPromptSettings.instance
        if (settings.isPromptEnabled('remoteConnected')) {
            const message = localize(
                'AWS.codecatalyst.connectedMessage',
                'Welcome to your Amazon CodeCatalyst Dev Environment. For more options and information, view Dev Environment settings ({0} Extension > CodeCatalyst).',
                getIdeProperties().company
            )
            const openDevEnvSettings = localize('AWS.codecatalyst.openDevEnvSettings', 'Open Dev Environment Settings')
            void vscode.window.showInformationMessage(message, dontShow, openDevEnvSettings).then(async (selection) => {
                if (selection === dontShow) {
                    await settings.disablePrompt('remoteConnected')
                } else if (selection === openDevEnvSettings) {
                    await CodeCatalystCommands.declared.openDevEnvSettings.execute()
                }
            })
        }
    }

    // This must always be called on activation
    DevEnvActivityStarter.init(authProvider)
}

async function showReadmeFileOnFirstLoad(workspaceState: vscode.ExtensionContext['workspaceState']): Promise<void> {
    if (isCloud9()) {
        return
    }

    getLogger().debug('codecatalyst: showReadmeFileOnFirstLoad()')
    // Check dev env state to see if this is the first time the user has connected to a dev env
    const isFirstLoad = workspaceState.get('aws.codecatalyst.devEnv.isFirstLoad', true)

    if (!isFirstLoad) {
        getLogger().info('codecatalyst: is not first load, skipping showing README.md')
        return
    }

    // Determine expected readme file location
    const readmePath = `README.md`

    // Find readme file in workspace
    const readmeUri = await vscode.workspace.findFiles(readmePath).then((files) => {
        if (files.length === 0) {
            return undefined
        }
        return files[0]
    })

    if (readmeUri === undefined) {
        getLogger().debug(`codecatalyst: README.md not found in path '${readmePath}'`)
        return
    }

    // Show rendered readme file to user
    await vscode.commands.executeCommand('markdown.showPreview', readmeUri)

    await workspaceState.update('aws.codecatalyst.devEnv.isFirstLoad', false)
}
