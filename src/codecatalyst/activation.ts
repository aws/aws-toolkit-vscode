/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { DevEnvClient } from '../shared/clients/devenvClient'
import { watchRestartingDevEnvs } from './reconnect'
import { getCodeCatalystDevEnvId } from '../shared/vscode/env'
import { PromptSettings } from '../shared/settings'
import { dontShow } from '../shared/localizedText'
import { isCloud9 } from '../shared/extensionUtilities'
import { Commands } from '../shared/vscode/commands2'
import { getCodeCatalystConfig } from '../shared/clients/codecatalystClient'
import { createClient } from '../shared/clients/codecatalystClient'
import { getConnectedDevEnv } from './model'
import { isDevenvVscode } from './utils'
import { getLogger } from '../shared/logger/logger'
import { UnknownError } from '../shared/errors'

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
        ...Object.values(CodeCatalystCommands.declared).map(c => c.register(commands))
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

    ctx.extensionContext.subscriptions.push(DevEnvClient.instance)
    if (DevEnvClient.instance.id) {
        ctx.extensionContext.subscriptions.push(registerDevfileWatcher(DevEnvClient.instance))
    }

    async function getDevEnv() {
        try {
            await authProvider.restore()
            const conn = authProvider.activeConnection
            if (conn !== undefined && authProvider.auth.getConnectionState(conn) === 'valid') {
                const client = await createClient(conn)

                return await getConnectedDevEnv(client)
            }
        } catch (err) {
            getLogger().warn(`codecatalyst: failed to get Dev Environment: ${UnknownError.cast(err).message}`)
        }
        return undefined
    }

    const settings = PromptSettings.instance
    if (getCodeCatalystDevEnvId()) {
        const devenv = await getDevEnv()
        getLogger().error(
            `codecatalyst: Dev Environment ides=[${devenv?.summary.ides?.reduce(
                (o1, o2) => o1 + ' ' + o2?.name ?? '',
                ''
            )}]`
        )

        if (!isDevenvVscode(devenv?.summary.ides)) {
            vscode.commands.executeCommand('workbench.action.remote.close')
            return
        }

        if (await settings.isPromptEnabled('remoteConnected')) {
            const message = localize(
                'AWS.codecatalyst.connectedMessage',
                'Welcome to your Amazon CodeCatalyst Dev Environment. For more options and information, view Dev Environment settings (AWS Extension > CodeCatalyst).'
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
    }

    Commands.register('aws.codecatalyst.removeConnection', () => {
        authProvider.removeSavedConnection()
    })
}
