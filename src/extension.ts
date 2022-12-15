/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import * as codecatalyst from './codecatalyst/activation'
import { activate as activateAwsExplorer } from './awsexplorer/activation'
import { activate as activateCloudWatchLogs } from './cloudWatchLogs/activation'
import { initialize as initializeCredentials } from './credentials/activation'
import { initializeAwsCredentialsStatusBarItem } from './credentials/awsCredentialsStatusBarItem'
import { LoginManager } from './credentials/loginManager'
import { CredentialsProviderManager } from './credentials/providers/credentialsProviderManager'
import { SharedCredentialsProviderFactory } from './credentials/providers/sharedCredentialsProviderFactory'
import { activate as activateSchemas } from './eventSchemas/activation'
import { activate as activateLambda } from './lambda/activation'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'
import { activate as activateCloudFormationTemplateRegistry } from './shared/cloudformation/activation'
import { activate as activateBuildspecTemplateRegistry } from './shared/buildspec/activation'
import { documentationUrl, endpointsFileUrl, githubCreateIssueUrl, githubUrl } from './shared/constants'
import { DefaultAwsContext } from './shared/awsContext'
import { AwsContextCommands } from './shared/awsContextCommands'
import {
    aboutToolkit,
    getIdeProperties,
    getToolkitEnvironmentDetails,
    initializeComputeRegion,
    showQuickStartWebview,
    showWelcomeMessage,
} from './shared/extensionUtilities'
import { getLogger, Logger } from './shared/logger/logger'
import { activate as activateLogger } from './shared/logger/activation'
import { RegionProvider } from './shared/regions/regionProvider'
import { EndpointsProvider } from './shared/regions/endpointsProvider'
import { FileResourceFetcher } from './shared/resourcefetcher/fileResourceFetcher'
import { HttpResourceFetcher } from './shared/resourcefetcher/httpResourceFetcher'
import { activate as activateEcr } from './ecr/activation'
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
import { activate as activateYamlExtPrompt } from './shared/extensions/yamlActivation'
import { CredentialsStore } from './credentials/credentialsStore'
import { getSamCliContext } from './shared/sam/cli/samCliContext'
import * as extWindow from './shared/vscode/window'
import { Ec2CredentialsProvider } from './credentials/providers/ec2CredentialsProvider'
import { EnvVarsCredentialsProvider } from './credentials/providers/envVarsCredentialsProvider'
import { EcsCredentialsProvider } from './credentials/providers/ecsCredentialsProvider'
import { SchemaService } from './shared/schemas'
import { AwsResourceManager } from './dynamicResources/awsResourceManager'
import globals, { initialize } from './shared/extensionGlobals'
import { join } from 'path'
import { Experiments, Settings } from './shared/settings'
import { getCodeCatalystDevEnvId, isReleaseVersion } from './shared/vscode/env'
import { Commands, registerErrorHandler } from './shared/vscode/commands2'
import { isUserCancelledError, ToolkitError } from './shared/errors'
import { Logging } from './shared/logger/commands'
import { UriHandler } from './shared/vscode/uriHandler'
import { telemetry } from './shared/telemetry/telemetry'
import { Auth } from './credentials/auth'

let localize: nls.LocalizeFunc

export async function activate(context: vscode.ExtensionContext) {
    await initializeComputeRegion()
    const activationStartedOn = Date.now()
    localize = nls.loadMessageBundle()
    initialize(context, extWindow.Window.vscode())
    initializeManifestPaths(context)

    const toolkitOutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.toolkit', '{0} Toolkit', getIdeProperties().company)
    )
    await activateLogger(context, toolkitOutputChannel)
    const remoteInvokeOutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.remoteInvoke', '{0} Remote Invocations', getIdeProperties().company)
    )
    globals.outputChannel = toolkitOutputChannel

    registerErrorHandler((info, error) => {
        const defaultMessage = localize('AWS.generic.message.error', 'Failed to run command: {0}', info.id)
        handleError(error, info.id, defaultMessage)
    })

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
        globals.schemaService = new SchemaService(context)
        globals.resourceManager = new AwsResourceManager(context)

        const settings = Settings.instance
        const experiments = Experiments.instance

        await initializeCredentials(context, awsContext, settings, loginManager)
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
        context.subscriptions.push(vscode.window.registerUriHandler(globals.uriHandler))

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

        await codecatalyst.activate(extContext)

        await activateCloudFormationTemplateRegistry(context)
        await activateBuildspecTemplateRegistry(context)

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

        if (getCodeCatalystDevEnvId() === undefined) {
            await activateCodeWhisperer(extContext)
        }

        await activateEcr(context)

        await activateCloudWatchLogs(context, settings)

        await activateDynamicResources(context)

        await activateIot(extContext)

        await activateEcs(extContext)

        await activateSchemas(extContext)

        await activateStepFunctions(context, awsContext, toolkitOutputChannel)

        await activateYamlExtPrompt()

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
    const message = error instanceof ToolkitError ? error.message : defaultMessage

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

function makeEndpointsProvider(): EndpointsProvider {
    const localManifestFetcher = new FileResourceFetcher(globals.manifestPaths.endpoints)
    const remoteManifestFetcher = new HttpResourceFetcher(endpointsFileUrl, { showUrl: true })

    const provider = new EndpointsProvider(localManifestFetcher, remoteManifestFetcher)

    return provider
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

// Unique extension entrypoint names, so that they can be obtained from the webpack bundle
export const awsToolkitActivate = activate
export const awsToolkitDeactivate = deactivate
