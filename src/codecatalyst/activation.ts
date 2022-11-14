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
import { watchBetaVSIX } from './beta'
import { Commands } from '../shared/vscode/commands2'

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

    GitExtension.instance.registerRemoteSourceProvider(remoteSourceProvider).then(disposable => {
        ctx.extensionContext.subscriptions.push(disposable)
    })

    if (!isCloud9()) {
        watchRestartingDevEnvs(ctx, authProvider)
        watchBetaVSIX()
    }

    const devenvClient = new DevEnvClient()
    if (devenvClient.id) {
        ctx.extensionContext.subscriptions.push(registerDevfileWatcher(devenvClient))
    }

    const settings = PromptSettings.instance
    if (getCodeCatalystDevEnvId()) {
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
