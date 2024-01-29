/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This module contains shared code between the main extension and browser/web
 * extension entrypoints.
 */

import vscode from 'vscode'
import globals, { initialize } from './shared/extensionGlobals'
import { join } from 'path'
import { Commands } from './shared/vscode/commands2'
import { documentationUrl, githubCreateIssueUrl, githubUrl } from './shared/constants'
import { getIdeProperties, aboutToolkit } from './shared/extensionUtilities'
import { telemetry } from './shared/telemetry/telemetry'
import { openUrl } from './shared/utilities/vsCodeUtils'

import { activate as activateLogger } from './shared/logger/activation'
import { initializeComputeRegion } from './shared/extensionUtilities'
import { activate as activateTelemetry } from './shared/telemetry/activation'
import { getLogger } from './shared/logger'
import { DefaultAwsContext } from './shared/awsContext'
import { Settings } from './shared/settings'
import { RegionProvider, defaultRegion } from './shared/regions/regionProvider'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'
import { initialize as initializeCredentials } from './auth/activation'
import { LoginManager } from './auth/deprecated/loginManager'
import { CredentialsStore } from './auth/credentials/store'
import { initializeAwsCredentialsStatusBarItem } from './auth/ui/statusBarItem'

/**
 * This is a temporary activate function that I will be moving pieces in to.
 * It will run code that works in both extension and extensionWeb activations.
 *
 * Eventually this will be renamed and by executed by both activations at startup
 * as a shared function.
 */
export async function testActivate(context: vscode.ExtensionContext) {
    // Setup the logger
    const toolkitOutputChannel = vscode.window.createOutputChannel('AWS Toolkit', { log: true })
    await activateLogger(context, toolkitOutputChannel)
    globals.outputChannel = toolkitOutputChannel

    //setup globals
    globals.awsContext = new DefaultAwsContext()
    globals.sdkClientBuilder = new DefaultAWSClientBuilder(globals.awsContext)
    globals.loginManager = new LoginManager(globals.awsContext, new CredentialsStore())
    setupGlobalsTempStubs()
}

/**
 * This function is temporary. In the following commits I will move parts of this
 * in to {@link testActivate} as I confirm that they work in both the browser
 * and node
 */
export async function browserActivate(context: vscode.ExtensionContext) {
    try {
        await testActivate(context)

        await initializeComputeRegion()
        initialize(context)
        initializeManifestPaths(context)

        await activateTelemetry(context, globals.awsContext, Settings.instance)

        await initializeCredentials(context, globals.awsContext, globals.loginManager)
        await initializeAwsCredentialsStatusBarItem(globals.awsContext, context)

        registerCommands(context)
    } catch (error) {
        const stacktrace = (error as Error).stack?.split('\n')
        // truncate if the stacktrace is unusually long
        if (stacktrace !== undefined && stacktrace.length > 40) {
            stacktrace.length = 40
        }
        getLogger().error(`Failed to activate extension`, error)
        throw error
    }
}

/**
 * Since we are still incrementally enabling certain functionality
 * in the browser, certain global variables will not have been set
 * and functionality we enabled will not work.
 *
 * This function sets up the minimum-required stubs for the necessary
 * variables to get things working.
 *
 * If needed we can eventually create the real implementations instead
 * of stubbing.
 */
function setupGlobalsTempStubs() {
    // This is required for telemetry to run.
    // The default region is arbitrary for now.
    // We didn't create an actual instance since it
    // will require non-trivial work to get the creation
    // of the instance in the browser working.
    globals.regionProvider = {
        guessDefaultRegion: () => defaultRegion,
    } as RegionProvider
}

export function initializeManifestPaths(extensionContext: vscode.ExtensionContext) {
    globals.manifestPaths.endpoints = extensionContext.asAbsolutePath(join('resources', 'endpoints.json'))
    globals.manifestPaths.lambdaSampleRequests = extensionContext.asAbsolutePath(
        join('resources', 'vs-lambda-sample-request-manifest.xml')
    )
}

/**
 * Registers generic commands used by both browser and node versions of the toolkit.
 */
export function registerCommands(extensionContext: vscode.ExtensionContext) {
    extensionContext.subscriptions.push(
        // No-op command used for decoration-only codelenses.
        vscode.commands.registerCommand('aws.doNothingCommand', () => {}),
        // "Show AWS Commands..."
        Commands.register('aws.listCommands', () =>
            vscode.commands.executeCommand('workbench.action.quickOpen', `> ${getIdeProperties().company}:`)
        ),
        // register URLs in extension menu
        Commands.register('aws.help', async () => {
            void openUrl(vscode.Uri.parse(documentationUrl))
            telemetry.aws_help.emit()
        }),
        Commands.register('aws.github', async () => {
            void openUrl(vscode.Uri.parse(githubUrl))
            telemetry.aws_showExtensionSource.emit()
        }),
        Commands.register('aws.createIssueOnGitHub', async () => {
            void openUrl(vscode.Uri.parse(githubCreateIssueUrl))
            telemetry.aws_reportPluginIssue.emit()
        }),
        Commands.register('aws.aboutToolkit', async () => {
            await aboutToolkit()
        })
    )
}
