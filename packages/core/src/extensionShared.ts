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

import globals, { initialize, isWeb } from './shared/extensionGlobals'
import { join } from 'path'
import { Commands } from './shared/vscode/commands2'
import { documentationUrl, endpointsFileUrl, githubCreateIssueUrl, githubUrl } from './shared/constants'
import { getIdeProperties, aboutExtension, isCloud9 } from './shared/extensionUtilities'
import { logAndShowError, logAndShowWebviewError } from './shared/utilities/logAndShowUtils'
import { AuthStatus, telemetry } from './shared/telemetry/telemetry'
import { openUrl } from './shared/utilities/vsCodeUtils'
import { activateViewsShared } from './awsexplorer/activationShared'

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
import { RegionProvider, getEndpointsFromFetcher } from './shared/regions/regionProvider'
import { getMachineId } from './shared/vscode/env'
import { registerErrorHandler as registerCommandErrorHandler } from './shared/vscode/commands2'
import { registerWebviewErrorHandler } from './webviews/server'
import { showQuickStartWebview } from './shared/extensionStartup'
import { ExtContext } from './shared/extensions'
import { getSamCliContext } from './shared/sam/cli/samCliContext'
import { UriHandler } from './shared/vscode/uriHandler'
import { disableAwsSdkWarning } from './shared/awsClientBuilder'
import { FileResourceFetcher } from './shared/resourcefetcher/fileResourceFetcher'
import { ResourceFetcher } from './shared/resourcefetcher/resourcefetcher'
import { ExtStartUpSources } from './shared/telemetry/util'
import { ExtensionUse, getAuthFormIdsFromConnection } from './auth/utils'
import { Auth } from './auth'
import { AuthFormId } from './auth/ui/vue/authForms/types'

// In web mode everything must be in a single file, so things like the endpoints file will not be available.
// The following imports the endpoints file, which causes webpack to bundle it in the final output file
import endpoints from '../resources/endpoints.json'

disableAwsSdkWarning()

let localize: nls.LocalizeFunc

/**
 * Activation/setup code that is shared by the regular (nodejs) extension AND web mode extension.
 * Most setup code should live here, unless there is a reason not to.
 */
export async function activateShared(
    context: vscode.ExtensionContext,
    contextPrefix: string,
    isWeb: boolean
): Promise<ExtContext> {
    localize = nls.loadMessageBundle()

    // some "initialize" functions
    initialize(context, isWeb)
    await initializeComputeRegion()

    globals.contextPrefix = '' //todo: disconnect supplied argument

    registerCommandErrorHandler((info, error) => {
        const defaultMessage = localize('AWS.generic.message.error', 'Failed to run command: {0}', info.id)
        void logAndShowError(localize, error, info.id, defaultMessage)
    })

    registerWebviewErrorHandler((error: unknown, webviewId: string, command: string) => {
        logAndShowWebviewError(localize, error, webviewId, command)
    })

    // Setup the logger
    const toolkitOutputChannel = vscode.window.createOutputChannel('AWS Toolkit', { log: true })
    const toolkitLogChannel = vscode.window.createOutputChannel('AWS Toolkit Logs', { log: true })
    await activateLogger(context, contextPrefix, toolkitOutputChannel, toolkitLogChannel)
    globals.outputChannel = toolkitOutputChannel
    globals.logOutputChannel = toolkitLogChannel

    if (isCloud9()) {
        vscode.window.withProgress = wrapWithProgressForCloud9(globals.outputChannel)
        context.subscriptions.push(
            Commands.register('aws.quickStart', async () => {
                try {
                    await showQuickStartWebview(context)
                } finally {
                    telemetry.aws_helpQuickstart.emit({ result: 'Succeeded' })
                }
            })
        )
    }

    //setup globals
    globals.machineId = await getMachineId()
    globals.awsContext = new DefaultAwsContext()
    globals.sdkClientBuilder = new DefaultAWSClientBuilder(globals.awsContext)
    globals.loginManager = new LoginManager(globals.awsContext, new CredentialsStore())

    // order matters here
    globals.manifestPaths.endpoints = context.asAbsolutePath(join('resources', 'endpoints.json'))
    globals.manifestPaths.lambdaSampleRequests = context.asAbsolutePath(
        join('resources', 'vs-lambda-sample-request-manifest.xml')
    )
    globals.regionProvider = RegionProvider.fromEndpointsProvider(makeEndpointsProvider())

    // telemetry
    await activateTelemetry(context, globals.awsContext, Settings.instance, 'AWS Toolkit For VS Code')

    // Create this now, but don't call vscode.window.registerUriHandler() until after all
    // Toolkit services have a chance to register their path handlers. #4105
    globals.uriHandler = new UriHandler()

    // Generic extension commands
    registerCommands(context, contextPrefix)

    // Toolkit specific commands
    context.subscriptions.push(
        // No-op command used for decoration-only codelenses.
        vscode.commands.registerCommand('aws.doNothingCommand', () => {}),
        // "Show AWS Commands..."
        Commands.register('aws.listCommands', () =>
            vscode.commands.executeCommand('workbench.action.quickOpen', `> ${getIdeProperties().company}:`)
        ),
        // register URLs in extension menu
        Commands.register(`aws.toolkit.help`, async () => {
            void openUrl(vscode.Uri.parse(documentationUrl))
            telemetry.aws_help.emit()
        })
    )

    // auth
    await initializeAuth(context, globals.loginManager, contextPrefix)
    await initializeAwsCredentialsStatusBarItem(globals.awsContext, context)

    const extContext: ExtContext = {
        extensionContext: context,
        awsContext: globals.awsContext,
        samCliContext: getSamCliContext,
        regionProvider: globals.regionProvider,
        outputChannel: globals.outputChannel,
        telemetryService: globals.telemetry,
        uriHandler: globals.uriHandler,
        credentialsStore: globals.loginManager.store,
    }

    await activateViewsShared(extContext.extensionContext)

    return extContext
}

/** Deactivation code that is shared between nodejs and web implementations */
export async function deactivateShared() {
    await globals.telemetry.shutdown()
}
/**
 * Registers generic commands used by both web and node versions of the toolkit.
 */
export function registerCommands(extensionContext: vscode.ExtensionContext, contextPrefix: string) {
    extensionContext.subscriptions.push(
        // register URLs in extension menu
        Commands.register(`aws.${contextPrefix}.github`, async () => {
            void openUrl(vscode.Uri.parse(githubUrl))
            telemetry.aws_showExtensionSource.emit()
        }),
        Commands.register(`aws.${contextPrefix}.createIssueOnGitHub`, async () => {
            void openUrl(vscode.Uri.parse(githubCreateIssueUrl))
            telemetry.aws_reportPluginIssue.emit()
        }),
        Commands.register(`aws.${contextPrefix}.aboutExtension`, async () => {
            await aboutExtension()
        })
    )
}

/**
 * Returns an object that provides AWS service endpoints that the toolkit supports.
 *
 * https://docs.aws.amazon.com/general/latest/gr/rande.html
 */
export function makeEndpointsProvider() {
    let localManifestFetcher: ResourceFetcher
    let remoteManifestFetcher: ResourceFetcher
    if (isWeb()) {
        localManifestFetcher = { get: async () => JSON.stringify(endpoints) }
        // Cannot use HttpResourceFetcher due to web mode breaking on import
        remoteManifestFetcher = { get: async () => (await fetch(endpointsFileUrl)).text() }
    } else {
        localManifestFetcher = new FileResourceFetcher(globals.manifestPaths.endpoints)
        // HACK: HttpResourceFetcher breaks web mode when imported, so we use webpack.IgnorePlugin()
        // to exclude it from the bundle.
        // TODO: Make HttpResourceFetcher web mode compatible
        const { HttpResourceFetcher } = require('./shared/resourcefetcher/httpResourceFetcher')
        remoteManifestFetcher = new HttpResourceFetcher(endpointsFileUrl, { showUrl: true })
    }

    return {
        local: () => getEndpointsFromFetcher(localManifestFetcher),
        remote: () => getEndpointsFromFetcher(remoteManifestFetcher),
    }
}

/**
 * Wraps the `vscode.window.withProgress` functionality with functionality that also writes to the output channel.
 *
 * Cloud9 does not show a progress notification.
 */
function wrapWithProgressForCloud9(channel: vscode.OutputChannel): (typeof vscode.window)['withProgress'] {
    const withProgress = vscode.window.withProgress.bind(vscode.window)

    return (options, task) => {
        if (options.title) {
            channel.appendLine(options.title)
        }

        return withProgress(options, (progress, token) => {
            const newProgress: typeof progress = {
                ...progress,
                report: value => {
                    if (value.message) {
                        channel.appendLine(value.message)
                    }
                    progress.report(value)
                },
            }

            return task(newProgress, token)
        })
    }
}

export async function emitUserState() {
    await telemetry.auth_userState.run(async () => {
        telemetry.record({ passive: true })

        const firstUse = ExtensionUse.instance.isFirstUse()
        const wasUpdated = ExtensionUse.instance.wasUpdated()

        if (firstUse) {
            telemetry.record({ source: ExtStartUpSources.firstStartUp })
        } else if (wasUpdated) {
            telemetry.record({ source: ExtStartUpSources.update })
        } else {
            telemetry.record({ source: ExtStartUpSources.reload })
        }

        let authStatus: AuthStatus = 'notConnected'
        const enabledConnections: Set<AuthFormId> = new Set()
        if (Auth.instance.hasConnections) {
            authStatus = 'expired'
            ;(await Auth.instance.listConnections()).forEach(conn => {
                const state = Auth.instance.getConnectionState(conn)
                if (state === 'valid') {
                    authStatus = 'connected'
                }

                getAuthFormIdsFromConnection(conn).forEach(id => enabledConnections.add(id))
            })
        }
        telemetry.record({
            authStatus,
            authEnabledConnections: [...enabledConnections].join(','),
        })
    })
}
