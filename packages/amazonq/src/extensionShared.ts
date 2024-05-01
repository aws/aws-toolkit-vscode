/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as semver from 'semver'
import { join } from 'path'
import {
    CodeSuggestionsState,
    activate as activateCodeWhisperer,
    shutdown as codewhispererShutdown,
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
import { makeEndpointsProvider, registerCommands } from 'aws-core-vscode'
import { activate as activateCWChat } from 'aws-core-vscode/amazonq'
import { activate as activateQGumby } from 'aws-core-vscode/amazonqGumby'
import { CommonAuthViewProvider, CommonAuthWebview } from 'aws-core-vscode/login'
import { isExtensionActive, VSCODE_EXTENSION_ID } from 'aws-core-vscode/utils'
import { registerSubmitFeedback } from 'aws-core-vscode/feedback'
import { telemetry, ExtStartUpSources } from 'aws-core-vscode/telemetry'
import { DevFunction, updateDevMode } from 'aws-core-vscode/dev'
import { getAuthStatus } from './auth/util'

export async function activateShared(context: vscode.ExtensionContext, isWeb: boolean) {
    initialize(context, isWeb)
    await initializeComputeRegion()

    const contextPrefix = 'amazonq'
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
                                `The Amazon Q extension is incompatible with AWS Toolkit ${toolkitVersion} and older. Your AWS Toolkit was updated to version 3.0 or later.`,
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
    await activateLogger(context, contextPrefix, qOutputChannel, qLogChannel)
    globals.outputChannel = qOutputChannel
    globals.logOutputChannel = qLogChannel
    globals.loginManager = new LoginManager(globals.awsContext, new CredentialsStore())

    await activateTelemetry(context, globals.awsContext, Settings.instance, 'Amazon Q For VS Code')

    await initializeAuth(context, globals.loginManager, contextPrefix, undefined)

    const extContext = {
        extensionContext: context,
    }
    await activateCodeWhisperer(extContext as ExtContext)
    await activateCWChat(context)
    await activateQGumby(extContext as ExtContext)

    // Generic extension commands
    registerCommands(context, contextPrefix)

    const authProvider = new CommonAuthViewProvider(context, contextPrefix)
    context.subscriptions.push(
        vscode.commands.registerCommand('amazonq.dev.openMenu', async () => {
            if (!isExtensionActive(VSCODE_EXTENSION_ID.awstoolkit)) {
                void vscode.window.showErrorMessage('AWS Toolkit must be installed to access the Developer Menu.')
                return
            }
            await vscode.commands.executeCommand('_aws.dev.invokeMenu', context, [
                'editStorage',
                'showEnvVars',
                'deleteSsoConnections',
                'expireSsoConnections',
            ] as DevFunction[])
        }),
        vscode.window.registerWebviewViewProvider(authProvider.viewType, authProvider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }),
        registerSubmitFeedback(context, 'Amazon Q', contextPrefix)
    )

    // Check for dev mode
    await updateDevMode()

    // Hide the Amazon Q tree in toolkit explorer
    await vscode.commands.executeCommand('setContext', amazonQDismissedKey, true)

    // reload webviews
    await vscode.commands.executeCommand('workbench.action.webview.reloadWebviewAction')

    // enable auto suggestions on activation
    await CodeSuggestionsState.instance.setSuggestionsEnabled(true)

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

        const { authStatus, authEnabledConnections } = await getAuthStatus()
        telemetry.record({
            authStatus,
            authEnabledConnections,
        })
    })
}

export async function deactivateShared() {
    await codewhispererShutdown()
}
