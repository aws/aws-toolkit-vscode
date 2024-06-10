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
import { makeEndpointsProvider, registerGenericCommands } from 'aws-core-vscode/common'
import { registerCommands } from './commands'

export const amazonQContextPrefix = 'amazonq'

/**
 * Activation code for Amazon Q that will we want in all environments (eg Node.js, web mode)
 */
export async function activateAmazonQCommon(context: vscode.ExtensionContext, isWeb: boolean) {
    initialize(context, isWeb)
    await initializeComputeRegion()
    globals.contextPrefix = 'amazonq.'

    try {
        if (await isIncompatibleToolkitInstalled()) {
            return
        }

        await setupGlobals(context)
        await setupLogging(context)
        await activateTelemetry(context, globals.awsContext, Settings.instance, 'Amazon Q For VS Code')
        await initializeAuth(globals.loginManager)
        await activateCodeWhisperer({ extensionContext: context } as ExtContext)
        registerGenericCommands(context, amazonQContextPrefix)
        registerCommands(context)
        await hideAmazonQTree()
        await reloadWebviews()
        await enableAutoSuggestions()
        await handleFirstUse()
        await recordTelemetry()
    } catch (error) {
        getLogger().error('Error during activation: %O', error)
    }
}

async function isIncompatibleToolkitInstalled() {
    const toolkit = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)
    if (!toolkit) {
        return false
    }

    const toolkitVersion = semver.coerce(toolkit.packageJSON.version)
    const isDevVersion = toolkit.packageJSON.version.toString().includes('-')

    if (toolkitVersion && toolkitVersion.major < 3 && !isDevVersion) {
        await vscode.commands
            .executeCommand('workbench.extensions.installExtension', VSCODE_EXTENSION_ID.awstoolkit)
            .then(
                () => promptReloadWindow(toolkitVersion),
                reason => getLogger().error('workbench.extensions.installExtension failed: %O', reason)
            )
        return true
    }
    return false
}

async function promptReloadWindow(toolkitVersion: any) {
    void vscode.window
        .showInformationMessage(
            `The Amazon Q extension is incompatible with AWS Toolkit ${toolkitVersion} and older. Your AWS Toolkit was updated to version 3.0 or later.`,
            'Reload Now'
        )
        .then(async resp => {
            if (resp === 'Reload Now') {
                await vscode.commands.executeCommand('workbench.action.reloadWindow')
            }
        })
}

async function setupGlobals(context: vscode.ExtensionContext) {
    globals.machineId = await getMachineId()
    globals.awsContext = new DefaultAwsContext()
    globals.sdkClientBuilder = new DefaultAWSClientBuilder(globals.awsContext)
    globals.manifestPaths.endpoints = context.asAbsolutePath(join('resources', 'endpoints.json'))
    globals.regionProvider = RegionProvider.fromEndpointsProvider(makeEndpointsProvider())
    globals.loginManager = new LoginManager(globals.awsContext, new CredentialsStore())
}

async function setupLogging(context: vscode.ExtensionContext) {
    const qOutputChannel = vscode.window.createOutputChannel('Amazon Q', { log: true })
    const qLogChannel = vscode.window.createOutputChannel('Amazon Q Logs', { log: true })
    await activateLogger(context, amazonQContextPrefix, qOutputChannel, qLogChannel)
    globals.outputChannel = qOutputChannel
    globals.logOutputChannel = qLogChannel
}

async function hideAmazonQTree() {
    await vscode.commands.executeCommand('setContext', amazonQDismissedKey, true)
}

async function reloadWebviews() {
    await vscode.commands.executeCommand('workbench.action.webview.reloadWebviewAction')
}

async function enableAutoSuggestions() {
    await CodeSuggestionsState.instance.setSuggestionsEnabled(true)
}

async function handleFirstUse() {
    if (AuthUtils.ExtensionUse.instance.isFirstUse()) {
        CommonAuthWebview.authSource = ExtStartUpSources.firstStartUp
        await vscode.commands.executeCommand('workbench.view.extension.amazonq')
    }
}

async function recordTelemetry() {
    await telemetry.auth_userState.run(async () => {
        telemetry.record({ passive: true })

        const firstUse = AuthUtils.ExtensionUse.instance.isFirstUse()
        const wasUpdated = AuthUtils.ExtensionUse.instance.wasUpdated()

        telemetry.record({
            source: firstUse
                ? ExtStartUpSources.firstStartUp
                : wasUpdated
                ? ExtStartUpSources.update
                : ExtStartUpSources.reload,
        })

        const { authStatus, authEnabledConnections, authScopes } = await getAuthStatus()
        telemetry.record({ authStatus, authEnabledConnections, authScopes })
    })
}

export async function deactivateCommon() {
    await shutdownCodeWhisperer()
}
