/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as semver from 'semver'
import { join } from 'path'
import {
    activate as activateCodeWhisperer,
    shutdown as shutdownCodeWhisperer,
    amazonQDismissedKey,
} from 'aws-core-vscode/codewhisperer'
import {
    ExtContext,
    initialize,
    activateLogger,
    activateTelemetry,
    Settings,
    DefaultAwsContext,
    initializeComputeRegion,
    DefaultAWSClientBuilder,
    globals,
    RegionProvider,
    getLogger,
    getMachineId,
} from 'aws-core-vscode/shared'
import { initializeAuth, CredentialsStore, LoginManager, AuthUtils } from 'aws-core-vscode/auth'
import { CommonAuthWebview } from 'aws-core-vscode/login'
import { VSCODE_EXTENSION_ID } from 'aws-core-vscode/utils'
import { telemetry, ExtStartUpSources } from 'aws-core-vscode/telemetry'
import { getAuthStatus } from './auth/util'
import { makeEndpointsProvider, registerGenericCommands } from 'aws-core-vscode/extensionCommon'
import { registerCommands } from './commands'

export const amazonQContextPrefix = 'amazonq'

/**
 * Activation code for Amazon Q that will we want in all environments (eg Node.js, web mode)
 */
export async function activateAmazonQCommon(context: vscode.ExtensionContext, isWeb: boolean) {
    initialize(context, isWeb)
    await initializeComputeRegion()

    globals.contextPrefix = 'amazonq.' //todo: disconnect from above line

    // Avoid activation if older toolkit is installed
    // Amazon Q is only compatible with AWS Toolkit >= 3.0.0
    // Or AWS Toolkit with a development version. Example: 2.19.0-3413gv
    const toolkit = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)
    if (toolkit) {
        const toolkitVersion = semver.coerce(toolkit.packageJSON.version)
        // XXX: can't use `SemVer.prerelease` because Toolkit "prerelease" (git sha) is not a valid
        // semver prerelease: it may start with a number.
        const isDevVersion = toolkit.packageJSON.version.toString().includes('-')
        if (toolkitVersion && toolkitVersion.major < 3 && !isDevVersion) {
            await vscode.commands
                .executeCommand('workbench.extensions.installExtension', VSCODE_EXTENSION_ID.awstoolkit)
                .then(
                    () =>
                        vscode.window
                            .showInformationMessage(
                                `The Amazon Q extension is incompatible with AWS Toolkit ${
                                    toolkitVersion as any
                                } and older. Your AWS Toolkit was updated to version 3.0 or later.`,
                                'Reload Now'
                            )
                            .then(async resp => {
                                if (resp === 'Reload Now') {
                                    await vscode.commands.executeCommand('workbench.action.reloadWindow')
                                }
                            }),
                    reason => {
                        getLogger().error('workbench.extensions.installExtension failed: %O', reason)
                    }
                )
            return
        }
    }

    globals.machineId = await getMachineId()
    globals.awsContext = new DefaultAwsContext()
    globals.sdkClientBuilder = new DefaultAWSClientBuilder(globals.awsContext)
    globals.manifestPaths.endpoints = context.asAbsolutePath(join('resources', 'endpoints.json'))
    globals.regionProvider = RegionProvider.fromEndpointsProvider(makeEndpointsProvider())

    const qOutputChannel = vscode.window.createOutputChannel('Amazon Q', { log: true })
    const qLogChannel = vscode.window.createOutputChannel('Amazon Q Logs', { log: true })
    await activateLogger(context, amazonQContextPrefix, qOutputChannel, qLogChannel)
    globals.outputChannel = qOutputChannel
    globals.logOutputChannel = qLogChannel
    globals.loginManager = new LoginManager(globals.awsContext, new CredentialsStore())

    await activateTelemetry(context, globals.awsContext, Settings.instance, 'Amazon Q For VS Code')

    await initializeAuth(globals.loginManager)

    const extContext = {
        extensionContext: context,
    }
    await activateCodeWhisperer(extContext as ExtContext)

    // Generic extension commands
    registerGenericCommands(context, amazonQContextPrefix)

    // Amazon Q specific commands
    registerCommands(context)

    // Hide the Amazon Q tree in toolkit explorer
    await vscode.commands.executeCommand('setContext', amazonQDismissedKey, true)

    // reload webviews
    await vscode.commands.executeCommand('workbench.action.webview.reloadWebviewAction')

    if (AuthUtils.ExtensionUse.instance.isFirstUse()) {
        CommonAuthWebview.authSource = ExtStartUpSources.firstStartUp
        await vscode.commands.executeCommand('workbench.view.extension.amazonq')
    }

    await telemetry.auth_userState.run(async () => {
        telemetry.record({ passive: true })

        const firstUse = AuthUtils.ExtensionUse.instance.isFirstUse()
        const wasUpdated = AuthUtils.ExtensionUse.instance.wasUpdated()

        if (firstUse) {
            telemetry.record({ source: ExtStartUpSources.firstStartUp })
        } else if (wasUpdated) {
            telemetry.record({ source: ExtStartUpSources.update })
        } else {
            telemetry.record({ source: ExtStartUpSources.reload })
        }

        const { authStatus, authEnabledConnections, authScopes } = await getAuthStatus()
        telemetry.record({
            authStatus,
            authEnabledConnections,
            authScopes,
        })
    })
}

export async function deactivateCommon() {
    await shutdownCodeWhisperer()
}
