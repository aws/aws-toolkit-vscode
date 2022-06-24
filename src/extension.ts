/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

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
import { AwsContextTreeCollection } from './shared/awsContextTreeCollection'
import { DefaultToolkitClientBuilder } from './shared/clients/toolkitClientBuilder'
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
import { DefaultRegionProvider } from './shared/regions/defaultRegionProvider'
import { EndpointsProvider } from './shared/regions/endpointsProvider'
import { FileResourceFetcher } from './shared/resourcefetcher/fileResourceFetcher'
import { HttpResourceFetcher } from './shared/resourcefetcher/httpResourceFetcher'
import { activate as activateEcr } from './ecr/activation'
import { activate as activateSam } from './shared/sam/activation'
import { activate as activateTelemetry } from './shared/telemetry/activation'
import { activate as activateS3 } from './s3/activation'
import * as awsFiletypes from './shared/awsFiletypes'
import * as telemetry from './shared/telemetry/telemetry'
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
import { initializeIconPaths } from './shared/icons'
import { Settings } from './shared/settings'
import { isReleaseVersion } from './shared/vscode/env'

let localize: nls.LocalizeFunc

export async function activate(context: vscode.ExtensionContext) {
    await initializeComputeRegion()
    const activationStartedOn = Date.now()
    localize = nls.loadMessageBundle()
    initialize(context, extWindow.Window.vscode())
    initializeIconPaths(context)
    initializeManifestPaths(context)

    const toolkitOutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.toolkit', '{0} Toolkit', getIdeProperties().company)
    )
    await activateLogger(context, toolkitOutputChannel)
    const remoteInvokeOutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.remoteInvoke', '{0} Remote Invocations', getIdeProperties().company)
    )
    globals.outputChannel = toolkitOutputChannel

    try {
        initializeCredentialsProviderManager()

        const endpointsProvider = makeEndpointsProvider()

        const awsContext = new DefaultAwsContext(context)
        globals.awsContext = awsContext
        const awsContextTrees = new AwsContextTreeCollection()
        const regionProvider = new DefaultRegionProvider(endpointsProvider)
        const credentialsStore = new CredentialsStore()
        const loginManager = new LoginManager(awsContext, credentialsStore)

        const toolkitEnvDetails = getToolkitEnvironmentDetails()
        // Splits environment details by new line, filter removes the empty string
        toolkitEnvDetails
            .split(/\r?\n/)
            .filter(x => x)
            .forEach(line => getLogger().info(line))

        await initializeAwsCredentialsStatusBarItem(awsContext, context)
        globals.regionProvider = regionProvider
        globals.awsContextCommands = new AwsContextCommands(awsContext, awsContextTrees, regionProvider, loginManager)
        globals.sdkClientBuilder = new DefaultAWSClientBuilder(awsContext)
        globals.toolkitClientBuilder = new DefaultToolkitClientBuilder(regionProvider)
        globals.schemaService = new SchemaService(context)
        globals.resourceManager = new AwsResourceManager(context)

        const settings = Settings.instance

        await initializeCredentials(context, awsContext, settings)

        await activateTelemetry(context, awsContext, settings)
        await globals.telemetry.start()
        await globals.schemaService.start()
        awsFiletypes.activate()

        const extContext: ExtContext = {
            extensionContext: context,
            awsContext: awsContext,
            samCliContext: getSamCliContext,
            regionProvider: regionProvider,
            outputChannel: toolkitOutputChannel,
            invokeOutputChannel: remoteInvokeOutputChannel,
            telemetryService: globals.telemetry,
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
            vscode.commands.registerCommand('aws.login', () => globals.awsContextCommands.onCommandLogin()),
            vscode.commands.registerCommand('aws.logout', () => globals.awsContextCommands.onCommandLogout()),
            // "Show AWS Commands..."
            vscode.commands.registerCommand('aws.listCommands', () =>
                vscode.commands.executeCommand('workbench.action.quickOpen', `> ${getIdeProperties().company}:`)
            )
        )

        context.subscriptions.push(
            vscode.commands.registerCommand('aws.credential.profile.create', async () => {
                try {
                    await globals.awsContextCommands.onCommandCreateCredentialsProfile()
                } finally {
                    telemetry.recordAwsCreateCredentials()
                }
            })
        )

        // register URLs in extension menu
        context.subscriptions.push(
            vscode.commands.registerCommand('aws.help', async () => {
                vscode.env.openExternal(vscode.Uri.parse(documentationUrl))
                telemetry.recordAwsHelp()
            })
        )
        context.subscriptions.push(
            vscode.commands.registerCommand('aws.github', async () => {
                vscode.env.openExternal(vscode.Uri.parse(githubUrl))
                telemetry.recordAwsShowExtensionSource()
            })
        )
        context.subscriptions.push(
            vscode.commands.registerCommand('aws.createIssueOnGitHub', async () => {
                vscode.env.openExternal(vscode.Uri.parse(githubCreateIssueUrl))
                telemetry.recordAwsReportPluginIssue()
            })
        )
        context.subscriptions.push(
            vscode.commands.registerCommand('aws.quickStart', async () => {
                try {
                    await showQuickStartWebview(context)
                } finally {
                    telemetry.recordAwsHelpQuickstart({ result: 'Succeeded' })
                }
            })
        )

        context.subscriptions.push(
            vscode.commands.registerCommand('aws.aboutToolkit', async () => {
                await aboutToolkit()
            })
        )

        await activateCloudFormationTemplateRegistry(context)

        await activateAwsExplorer({
            context: extContext,
            awsContextTrees,
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

        await activateSsmDocument(context, awsContext, regionProvider, toolkitOutputChannel)

        await activateSam(extContext)

        await activateS3(extContext)

        await activateCodeWhisperer(extContext)

        await activateEcr(context)

        await activateCloudWatchLogs(context, settings)

        await activateDynamicResources(context)

        await activateIot(extContext)

        await activateEcs(extContext)

        // Features which aren't currently functional in Cloud9
        if (!isCloud9()) {
            await activateSchemas(extContext)
        }

        await activateStepFunctions(context, awsContext, toolkitOutputChannel)

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
    // Start the load without waiting. It raises events as fetchers retrieve data.
    provider.load().catch((err: Error) => {
        getLogger().error('Failure while loading Endpoints Manifest: %O', err)

        vscode.window.showErrorMessage(
            `${localize(
                'AWS.error.endpoint.load.failure',
                'The {0} Toolkit was unable to load endpoints data.',
                getIdeProperties().company
            )} ${
                isCloud9()
                    ? localize(
                          'AWS.error.impactedFunctionalityReset.cloud9',
                          'Toolkit functionality may be impacted until the Cloud9 browser tab is refreshed.'
                      )
                    : localize(
                          'AWS.error.impactedFunctionalityReset.vscode',
                          'Toolkit functionality may be impacted until VS Code is restarted.'
                      )
            }`
        )
    })

    return provider
}

function recordToolkitInitialization(activationStartedOn: number, logger?: Logger) {
    try {
        const activationFinishedOn = Date.now()
        const duration = activationFinishedOn - activationStartedOn

        telemetry.recordToolkitInit({
            duration: duration,
        })
    } catch (err) {
        logger?.error(err as Error)
    }
}

// Unique extension entrypoint names, so that they can be obtained from the webpack bundle
export const awsToolkitActivate = activate
export const awsToolkitDeactivate = deactivate
