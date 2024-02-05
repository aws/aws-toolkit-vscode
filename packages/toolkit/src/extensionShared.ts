/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This module contains shared code between the main extension and browser/web
 * extension entrypoints.
 */

import vscode from 'vscode'
import * as nls from 'vscode-nls'

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
import { DefaultAwsContext } from './shared/awsContext'
import { Settings } from './shared/settings'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'
import { initialize as initializeAuth } from './auth/activation'
import { LoginManager } from './auth/deprecated/loginManager'
import { CredentialsStore } from './auth/credentials/store'
import { initializeAwsCredentialsStatusBarItem } from './auth/ui/statusBarItem'
import { RegionProvider } from './shared/regions/regionProvider'
import { ChildProcess } from './shared/utilities/childProcess'
import { isInBrowser } from './common/browserUtils'
import { registerErrorHandler as registerCommandErrorHandler } from './shared/vscode/commands2'
import { ToolkitError, isUserCancelledError, resolveErrorMessageToDisplay } from './shared/errors'
import { getLogger } from './shared/logger'
import { showMessageWithUrl } from './shared/utilities/messages'
import { Logging } from './shared/logger/commands'
import { registerWebviewErrorHandler } from './webviews/server'

let localize: nls.LocalizeFunc

/**
 * Activation/setup code that is shared by the regular (nodejs) extension AND browser-compatible extension.
 * Most setup code should live here, unless there is a reason not to.
 *
 * @param getRegionProvider - HACK telemetry requires the region provider but we cannot create it yet in this
 * "shared" function since it breaks in browser. So for now the caller must provide it.
 */
export async function activateShared(context: vscode.ExtensionContext, getRegionProvider: () => RegionProvider) {
    localize = nls.loadMessageBundle()

    registerCommandErrorHandler((info, error) => {
        const defaultMessage = localize('AWS.generic.message.error', 'Failed to run command: {0}', info.id)
        void logAndShowError(error, info.id, defaultMessage)
    })

    registerWebviewErrorHandler((error: unknown, webviewId: string, command: string) => {
        logAndShowWebviewError(error, webviewId, command)
    })

    // Setup the logger
    const toolkitOutputChannel = vscode.window.createOutputChannel('AWS Toolkit', { log: true })
    await activateLogger(context, toolkitOutputChannel)
    globals.outputChannel = toolkitOutputChannel

    //setup globals
    globals.machineId = await getMachineId()
    globals.awsContext = new DefaultAwsContext()
    globals.sdkClientBuilder = new DefaultAWSClientBuilder(globals.awsContext)
    globals.loginManager = new LoginManager(globals.awsContext, new CredentialsStore())

    // some "initialize" functions
    await initializeComputeRegion()
    initialize(context)

    // order matters here
    globals.manifestPaths.endpoints = context.asAbsolutePath(join('resources', 'endpoints.json'))
    globals.manifestPaths.lambdaSampleRequests = context.asAbsolutePath(
        join('resources', 'vs-lambda-sample-request-manifest.xml')
    )
    globals.regionProvider = getRegionProvider()

    // telemetry
    await activateTelemetry(context, globals.awsContext, Settings.instance)

    // auth
    await initializeAuth(context, globals.awsContext, globals.loginManager)
    await initializeAwsCredentialsStatusBarItem(globals.awsContext, context)

    registerCommands(context)
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

async function getMachineId(): Promise<string> {
    if (isInBrowser()) {
        return 'browser'
    }
    const proc = new ChildProcess('hostname', [], { collect: true, logging: 'no' })
    return (await proc.run()).stdout.trim() ?? 'unknown-host'
}

/**
 * Logs the error. Then determines what kind of error message should be shown, if
 * at all.
 *
 * @param error The error itself
 * @param topic The prefix of the error message
 * @param defaultMessage The message to show if once cannot be resolved from the given error
 *
 * SIDE NOTE:
 * This is only being used for errors from commands and webview, there's plenty of other places
 * (explorer, nodes, ...) where it could be used. It needs to be apart of some sort of `core`
 * module that is guaranteed to initialize prior to every other Toolkit component.
 * Logging and telemetry would fit well within this core module.
 */
async function logAndShowError(error: unknown, topic: string, defaultMessage: string) {
    if (isUserCancelledError(error)) {
        getLogger().verbose(`${topic}: user cancelled`)
        return
    }
    const logsItem = localize('AWS.generic.message.viewLogs', 'View Logs...')
    const logId = getLogger().error(`${topic}: %s`, error)
    const message = resolveErrorMessageToDisplay(error, defaultMessage)

    if (error instanceof ToolkitError && error.documentationUri) {
        await showMessageWithUrl(message, error.documentationUri, 'View Documentation', 'error')
    } else {
        await vscode.window.showErrorMessage(message, logsItem).then(async resp => {
            if (resp === logsItem) {
                await Logging.declared.viewLogsAtMessage.execute(logId)
            }
        })
    }
}

/**
 * Show a webview related error to the user + button that links to the logged error
 *
 * @param err The error that was thrown in the backend
 * @param webviewId Arbitrary value that identifies which webview had the error
 * @param command The high level command/function that was run which triggered the error
 */
function logAndShowWebviewError(err: unknown, webviewId: string, command: string) {
    // HACK: The following implementation is a hack, influenced by the implementation of handleError().
    // The userFacingError message will be seen in the UI, and the detailedError message will provide the
    // detailed information in the logs.
    const detailedError = ToolkitError.chain(err, `Webview backend command failed: "${command}()"`)
    const userFacingError = ToolkitError.chain(detailedError, 'Webview error')
    logAndShowError(userFacingError, `webviewId="${webviewId}"`, 'Webview error').catch(e => {
        getLogger().error('logAndShowError failed: %s', (e as Error).message)
    })
}
