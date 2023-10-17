/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import * as codecatalyst from './codecatalyst/activation'
import { activate as activateAwsExplorer } from './awsexplorer/activation'
import { activate as activateCloudWatchLogs } from './cloudWatchLogs/activation'
import { initialize as initializeCredentials } from './auth/activation'
import { initializeAwsCredentialsStatusBarItem } from './auth/ui/statusBarItem'
import { LoginManager } from './auth/deprecated/loginManager'
import { CredentialsProviderManager } from './auth/providers/credentialsProviderManager'
import { SharedCredentialsProviderFactory } from './auth/providers/sharedCredentialsProviderFactory'
import { activate as activateSchemas } from './eventSchemas/activation'
import { activate as activateLambda } from './lambda/activation'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'
import { activate as activateCloudFormationTemplateRegistry } from './shared/cloudformation/activation'
import { documentationUrl, endpointsFileUrl, githubCreateIssueUrl, githubUrl } from './shared/constants'
import { DefaultAwsContext } from './shared/awsContext'
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
import { getEndpointsFromFetcher, RegionProvider } from './shared/regions/regionProvider'
import { FileResourceFetcher } from './shared/resourcefetcher/fileResourceFetcher'
import { HttpResourceFetcher } from './shared/resourcefetcher/httpResourceFetcher'
import { activate as activateEcr } from './ecr/activation'
import { activate as activateEc2 } from './ec2/activation'
import { activate as activateSam } from './shared/sam/activation'
import { activate as activateTelemetry } from './shared/telemetry/activation'
import { activate as activateS3 } from './s3/activation'
import * as awsFiletypes from './shared/awsFiletypes'
import { activate as activateCodeWhisperer, shutdown as codewhispererShutdown } from './codewhisperer/activation'
import { ExtContext } from './shared/extensions'
import { activate as activateApiGateway } from './apigateway/activation'
import { activate as activateStepFunctions } from './stepFunctions/activation'
import { activate as activateSsmDocument } from './ssmDocument/activation'
import { activate as activateDynamicResources } from './dynamicResources/activation'
import { activate as activateEcs } from './ecs/activation'
import { activate as activateAppRunner } from './apprunner/activation'
import { activate as activateIot } from './iot/activation'
import { activate as activateDev } from './dev/activation'
import { activate as activateRedshift } from './redshift/activation'
import { CredentialsStore } from './auth/credentials/store'
import { getSamCliContext } from './shared/sam/cli/samCliContext'
import { Ec2CredentialsProvider } from './auth/providers/ec2CredentialsProvider'
import { EnvVarsCredentialsProvider } from './auth/providers/envVarsCredentialsProvider'
import { EcsCredentialsProvider } from './auth/providers/ecsCredentialsProvider'
import { SchemaService } from './shared/schemas'
import { AwsResourceManager } from './dynamicResources/awsResourceManager'
import globals, { initialize } from './shared/extensionGlobals'
import { Experiments, Settings } from './shared/settings'
import { isReleaseVersion } from './shared/vscode/env'
import { Commands, registerErrorHandler as registerCommandErrorHandler } from './shared/vscode/commands2'
import { UriHandler } from './shared/vscode/uriHandler'
import { telemetry } from './shared/telemetry/telemetry'
import { Auth } from './auth/auth'
import { openUrl } from './shared/utilities/vsCodeUtils'
import { isUserCancelledError, resolveErrorMessageToDisplay, ToolkitError } from './shared/errors'
import { Logging } from './shared/logger/commands'
import { showMessageWithUrl } from './shared/utilities/messages'
import { registerWebviewErrorHandler } from './webviews/server'
import { initializeManifestPaths } from './extensionShared'

let localize: nls.LocalizeFunc

export async function activate(context: vscode.ExtensionContext) {
    await initializeComputeRegion()
    const activationStartedOn = Date.now()
    localize = nls.loadMessageBundle()
    initialize(context)
    initializeManifestPaths(context)

    const toolkitOutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.toolkit', '{0} Toolkit', getIdeProperties().company)
    )
    await activateLogger(context, toolkitOutputChannel)
    const remoteInvokeOutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.remoteInvoke', '{0} Remote Invocations', getIdeProperties().company)
    )
    globals.outputChannel = toolkitOutputChannel

    registerCommandErrorHandler((info, error) => {
        const defaultMessage = localize('AWS.generic.message.error', 'Failed to run command: {0}', info.id)
        logAndShowError(error, info.id, defaultMessage)
    })

    registerWebviewErrorHandler((error: unknown, webviewId: string, command: string) => {
        logAndShowWebviewError(error, webviewId, command)
    })

    if (isCloud9()) {
        vscode.window.withProgress = wrapWithProgressForCloud9(globals.outputChannel)
    }

    try {
        initializeCredentialsProviderManager()

        const endpointsProvider = makeEndpointsProvider()

        const awsContext = new DefaultAwsContext()
        globals.awsContext = awsContext
        const regionProvider = RegionProvider.fromEndpointsProvider(endpointsProvider)
        const credentialsStore = new CredentialsStore()
        const loginManager = new LoginManager(globals.awsContext, credentialsStore)

        const toolkitEnvDetails = getToolkitEnvironmentDetails()
        // Splits environment details by new line, filter removes the empty string
        toolkitEnvDetails
            .split(/\r?\n/)
            .filter(x => x)
            .forEach(line => getLogger().info(line))

        await initializeAwsCredentialsStatusBarItem(awsContext, context)
        globals.regionProvider = regionProvider
        globals.loginManager = loginManager
        globals.awsContextCommands = new AwsContextCommands(regionProvider, Auth.instance)
        globals.sdkClientBuilder = new DefaultAWSClientBuilder(awsContext)
        globals.schemaService = new SchemaService()
        globals.resourceManager = new AwsResourceManager(context)

        const settings = Settings.instance
        const experiments = Experiments.instance

        await initializeCredentials(context, awsContext, loginManager)
        await activateTelemetry(context, awsContext, settings)

        experiments.onDidChange(({ key }) => {
            telemetry.aws_experimentActivation.run(span => {
                // Record the key prior to reading the setting as `get` may throw
                span.record({ experimentId: key })
                span.record({ experimentState: experiments.get(key) ? 'activated' : 'deactivated' })
            })
        })

        await globals.schemaService.start()
        awsFiletypes.activate()

        globals.uriHandler = new UriHandler()
        context.subscriptions.push(
            vscode.window.registerUriHandler({
                handleUri: uri =>
                    telemetry.runRoot(() => {
                        telemetry.record({ source: 'UriHandler' })

                        return globals.uriHandler.handleUri(uri)
                    }),
            })
        )

        const extContext: ExtContext = {
            extensionContext: context,
            awsContext: globals.awsContext,
            samCliContext: getSamCliContext,
            regionProvider: regionProvider,
            outputChannel: toolkitOutputChannel,
            invokeOutputChannel: remoteInvokeOutputChannel,
            telemetryService: globals.telemetry,
            uriHandler: globals.uriHandler,
            credentialsStore,
        }

        try {
            activateDev(extContext)
        } catch (error) {
            getLogger().debug(`Developer Tools (internal): failed to activate: ${(error as Error).message}`)
        }

        context.subscriptions.push(
            // No-op command used for decoration-only codelenses.
            vscode.commands.registerCommand('aws.doNothingCommand', () => {}),
            // "Show AWS Commands..."
            Commands.register('aws.listCommands', () =>
                vscode.commands.executeCommand('workbench.action.quickOpen', `> ${getIdeProperties().company}:`)
            ),
            // register URLs in extension menu
            Commands.register('aws.help', async () => {
                openUrl(vscode.Uri.parse(documentationUrl))
                telemetry.aws_help.emit()
            }),
            Commands.register('aws.github', async () => {
                openUrl(vscode.Uri.parse(githubUrl))
                telemetry.aws_showExtensionSource.emit()
            }),
            Commands.register('aws.createIssueOnGitHub', async () => {
                openUrl(vscode.Uri.parse(githubCreateIssueUrl))
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

        await codecatalyst.activate(extContext)

        await activateCloudFormationTemplateRegistry(context)

        await activateCodeWhisperer(extContext)

        await activateAwsExplorer({
            context: extContext,
            regionProvider,
            toolkitOutputChannel,
            remoteInvokeOutputChannel,
        })

        await activateAppRunner(extContext)

        await activateApiGateway({
            extContext: extContext,
            outputChannel: remoteInvokeOutputChannel,
        })

        await activateLambda(extContext)

        await activateSsmDocument(context, globals.awsContext, regionProvider, toolkitOutputChannel)

        await activateSam(extContext)

        await activateS3(extContext)

        await activateEc2(extContext)

        await activateEcr(context)

        await activateCloudWatchLogs(context, settings)

        await activateDynamicResources(context)

        await activateIot(extContext)

        await activateEcs(extContext)

        await activateSchemas(extContext)

        await activateStepFunctions(context, awsContext, toolkitOutputChannel)

        await activateRedshift(extContext)

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

export async function deactivate() {
    await codewhispererShutdown()
    await globals.telemetry.shutdown()
    await globals.resourceManager.dispose()
}

function initializeCredentialsProviderManager() {
    const manager = CredentialsProviderManager.getInstance()
    manager.addProviderFactory(new SharedCredentialsProviderFactory())
    manager.addProviders(new Ec2CredentialsProvider(), new EcsCredentialsProvider(), new EnvVarsCredentialsProvider())
}

function makeEndpointsProvider() {
    const localManifestFetcher = new FileResourceFetcher(globals.manifestPaths.endpoints)
    const remoteManifestFetcher = new HttpResourceFetcher(endpointsFileUrl, { showUrl: true })

    return {
        local: () => getEndpointsFromFetcher(localManifestFetcher),
        remote: () => getEndpointsFromFetcher(remoteManifestFetcher),
    }
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
export async function logAndShowError(error: unknown, topic: string, defaultMessage: string) {
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
export function logAndShowWebviewError(err: unknown, webviewId: string, command: string) {
    // HACK: The following implementation is a hack, influenced by the implementation of handleError().
    // The userFacingError message will be seen in the UI, and the detailedError message will provide the
    // detailed information in the logs.
    const detailedError = ToolkitError.chain(err, `Webview backend command failed: "${command}()"`)
    const userFacingError = ToolkitError.chain(detailedError, 'Webview error')
    logAndShowError(userFacingError, `webviewId="${webviewId}"`, 'Webview error')
}

// Unique extension entrypoint names, so that they can be obtained from the webpack bundle
export const awsToolkitActivate = activate
export const awsToolkitDeactivate = deactivate
