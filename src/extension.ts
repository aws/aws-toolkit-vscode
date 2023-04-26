/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { initializeAwsCredentialsStatusBarItem } from './credentials/statusBarItem'
import { LoginManager } from './credentials/loginManager'
import { CredentialsProviderManager } from './credentials/providers/credentialsProviderManager'
import { SharedCredentialsProviderFactory } from './credentials/providers/sharedCredentialsProviderFactory'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'
import { activate as activateCloudFormationTemplateRegistry } from './shared/cloudformation/activation'
import { documentationUrl, githubCreateIssueUrl, githubUrl } from './shared/constants'
import { AwsContextCommands } from './shared/awsContextCommands'
import {
    aboutToolkit,
    getIdeProperties,
    getToolkitEnvironmentDetails,
    initializeComputeRegion,
    isCloud9,
    showQuickStartWebview,
    showWelcomeMessage,
} from './shared/extensionUtilities'
import { getLogger, Logger } from './shared/logger/logger'
import { activate as activateLogger } from './shared/logger/activation'
import { activate as activateSam } from './shared/sam/activation'
import { activate as activateTelemetry } from './shared/telemetry/activation'
import * as awsFiletypes from './shared/awsFiletypes'
import { shutdown as codewhispererShutdown } from './codewhisperer'
import { Ec2CredentialsProvider } from './credentials/providers/ec2CredentialsProvider'
import { EnvVarsCredentialsProvider } from './credentials/providers/envVarsCredentialsProvider'
import { EcsCredentialsProvider } from './credentials/providers/ecsCredentialsProvider'
import { SchemaService } from './shared/schemas'
import { AwsResourceManager } from './dynamicResources/awsResourceManager'
import globals, { initialize } from './shared/extensionGlobals'
import { join } from 'path'
import { Experiments, Settings } from './shared/settings'
import { isReleaseVersion } from './shared/vscode/env'
import { Commands, registerErrorHandler } from './shared/vscode/commands2'
import { isUserCancelledError, resolveErrorMessageToDisplay } from './shared/errors'
import { Logging } from './shared/logger/commands'
import { telemetry } from './shared/telemetry/telemetry'
import { Auth } from './credentials/auth'
import { activateModules, extcontextModule } from './modules.gen'
import { DefaultAwsContext } from './shared/awsContext'

let localize: nls.LocalizeFunc

export async function activate(context: vscode.ExtensionContext) {
    const activationStartedOn = Date.now()
    localize = nls.loadMessageBundle()
    initialize(context)
    initializeManifestPaths(context)
    globals.awsContext = new DefaultAwsContext()
    await initializeComputeRegion()

    const toolkitOutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.toolkit', '{0} Toolkit', getIdeProperties().company)
    )
    await activateLogger(context, toolkitOutputChannel)
    globals.outputChannel = toolkitOutputChannel

    registerErrorHandler((info, error) => {
        const defaultMessage = localize('AWS.generic.message.error', 'Failed to run command: {0}', info.id)
        handleError(error, info.id, defaultMessage)
    })

    if (isCloud9()) {
        vscode.window.withProgress = wrapWithProgressForCloud9(globals.outputChannel)
    }

    try {
        const settings = Settings.instance
        const experiments = Experiments.instance

        await activateTelemetry(context, settings)
        const extContext = await extcontextModule.activate(context)
        globals.regionProvider = extContext.regionProvider

        initializeCredentialsProviderManager()

        const awsContext = extContext.awsContext
        const credentialsStore = extContext.credentialsStore
        const loginManager = new LoginManager(awsContext, credentialsStore)

        const toolkitEnvDetails = getToolkitEnvironmentDetails()
        // Splits environment details by new line, filter removes the empty string
        toolkitEnvDetails
            .split(/\r?\n/)
            .filter(x => x)
            .forEach(line => getLogger().info(line))

        await initializeAwsCredentialsStatusBarItem(awsContext, context)
        globals.loginManager = loginManager
        globals.awsContextCommands = new AwsContextCommands(extContext.regionProvider, Auth.instance)
        globals.sdkClientBuilder = new DefaultAWSClientBuilder(awsContext)
        globals.schemaService = new SchemaService()
        globals.resourceManager = new AwsResourceManager(context)

        experiments.onDidChange(({ key }) => {
            telemetry.aws_experimentActivation.run(span => {
                // Record the key prior to reading the setting as `get` may throw
                span.record({ experimentId: key })
                span.record({ experimentState: experiments.get(key) ? 'activated' : 'deactivated' })
            })
        })

        await globals.schemaService.start()
        awsFiletypes.activate()

        context.subscriptions.push(
            // No-op command used for decoration-only codelenses.
            vscode.commands.registerCommand('aws.doNothingCommand', () => {}),
            // "Show AWS Commands..."
            Commands.register('aws.listCommands', () =>
                vscode.commands.executeCommand('workbench.action.quickOpen', `> ${getIdeProperties().company}:`)
            ),
            // register URLs in extension menu
            Commands.register('aws.help', async () => {
                vscode.env.openExternal(vscode.Uri.parse(documentationUrl))
                telemetry.aws_help.emit()
            }),
            Commands.register('aws.github', async () => {
                vscode.env.openExternal(vscode.Uri.parse(githubUrl))
                telemetry.aws_showExtensionSource.emit()
            }),
            Commands.register('aws.createIssueOnGitHub', async () => {
                vscode.env.openExternal(vscode.Uri.parse(githubCreateIssueUrl))
                telemetry.aws_reportPluginIssue.emit()
            }),
            Commands.register('aws.quickStart', async () => {
                try {
                    await showQuickStartWebview(context)
                } finally {
                    telemetry.aws_helpQuickstart.emit({ result: 'Succeeded' })
                }
            }),
            Commands.register('aws.aboutToolkit', async () => {
                await aboutToolkit()
            })
        )

        await activateCloudFormationTemplateRegistry(context)

        await activateModules(context)

        await activateSam(extContext)

        showWelcomeMessage(context)

        recordToolkitInitialization(activationStartedOn, getLogger())

        if (!isReleaseVersion()) {
            globals.telemetry.assertPassiveTelemetry(globals.didReload)
        }
    } catch (error) {
        const stacktrace = (error as Error).stack?.split('\n')
        // truncate if the stacktrace is unusually long
        if (stacktrace !== undefined && stacktrace.length > 40) {
            stacktrace.length = 40
        }
        getLogger('channel').error(
            localize(
                'AWS.channel.aws.toolkit.activation.error',
                'Error Activating {0} Toolkit: {1} \n{2}',
                getIdeProperties().company,
                (error as Error).message,
                stacktrace?.join('\n')
            )
        )
        throw error
    }
}

// This is only being used for errors from commands although there's plenty of other places where it
// could be used. It needs to be apart of some sort of `core` module that is guaranteed to initialize
// prior to every other Toolkit component. Logging and telemetry would fit well within this core module.
async function handleError(error: unknown, topic: string, defaultMessage: string) {
    if (isUserCancelledError(error)) {
        getLogger().verbose(`${topic}: user cancelled`)
        return
    }

    const logsItem = localize('AWS.generic.message.viewLogs', 'View Logs...')
    const logId = getLogger().error(`${topic}: %s`, error)
    const message = resolveErrorMessageToDisplay(error, defaultMessage)

    await vscode.window.showErrorMessage(message, logsItem).then(async resp => {
        if (resp === logsItem) {
            await Logging.declared.viewLogsAtMessage.execute(logId)
        }
    })
}

export async function deactivate() {
    await codewhispererShutdown()
    await globals.telemetry.shutdown()
    await globals.resourceManager.dispose()
}

function initializeManifestPaths(extensionContext: vscode.ExtensionContext) {
    globals.manifestPaths.endpoints = extensionContext.asAbsolutePath(join('resources', 'endpoints.json'))
    globals.manifestPaths.lambdaSampleRequests = extensionContext.asAbsolutePath(
        join('resources', 'vs-lambda-sample-request-manifest.xml')
    )
}

function initializeCredentialsProviderManager() {
    const manager = CredentialsProviderManager.getInstance()
    manager.addProviderFactory(new SharedCredentialsProviderFactory())
    manager.addProviders(new Ec2CredentialsProvider(), new EcsCredentialsProvider(), new EnvVarsCredentialsProvider())
}

function recordToolkitInitialization(activationStartedOn: number, logger?: Logger) {
    try {
        const activationFinishedOn = Date.now()
        const duration = activationFinishedOn - activationStartedOn

        telemetry.toolkit_init.emit({ duration })
    } catch (err) {
        logger?.error(err as Error)
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

// Unique extension entrypoint names, so that they can be obtained from the webpack bundle
export const awsToolkitActivate = activate
export const awsToolkitDeactivate = deactivate
