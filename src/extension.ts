/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { activate as activateAwsExplorer } from './awsexplorer/activation'
import { activate as activateCdk } from './cdk/activation'
import { initialize as initializeCredentials, loginWithMostRecentCredentials } from './credentials/activation'
import { initializeAwsCredentialsStatusBarItem } from './credentials/awsCredentialsStatusBarItem'
import { LoginManager } from './credentials/loginManager'
import { CredentialsProviderManager } from './credentials/providers/credentialsProviderManager'
import { SharedCredentialsProviderFactory } from './credentials/providers/sharedCredentialsProviderFactory'
import { activate as activateSchemas } from './eventSchemas/activation'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'
import { AwsContextTreeCollection } from './shared/awsContextTreeCollection'
import { DefaultToolkitClientBuilder } from './shared/clients/defaultToolkitClientBuilder'
import {
    documentationUrl,
    endpointsFileUrl,
    extensionSettingsPrefix,
    githubUrl,
    reportIssueUrl
} from './shared/constants'
import { DefaultAwsContext } from './shared/defaultAwsContext'
import { DefaultAWSContextCommands } from './shared/defaultAwsContextCommands'
import { ext } from './shared/extensionGlobals'
import { showQuickStartWebview, toastNewUser } from './shared/extensionUtilities'
import { getLogger } from './shared/logger'
import { activate as activateLogger } from './shared/logger/activation'
import { DefaultRegionProvider } from './shared/regions/defaultRegionProvider'
import { EndpointsProvider } from './shared/regions/endpointsProvider'
import { FileResourceFetcher } from './shared/resourcefetcher/fileResourceFetcher'
import { HttpResourceFetcher } from './shared/resourcefetcher/httpResourceFetcher'
import { activate as activateServerless } from './shared/sam/activation'
import { DefaultSettingsConfiguration } from './shared/settingsConfiguration'
import { AwsTelemetryOptOut } from './shared/telemetry/awsTelemetryOptOut'
import { DefaultTelemetryService } from './shared/telemetry/defaultTelemetryService'
import {
    recordAwsCreateCredentials,
    recordAwsHelp,
    recordAwsHelpQuickstart,
    recordAwsReportPluginIssue,
    recordAwsShowExtensionSource
} from './shared/telemetry/telemetry'
import { ExtensionDisposableFiles } from './shared/utilities/disposableFiles'
import { getChannelLogger } from './shared/utilities/vsCodeUtils'

let localize: nls.LocalizeFunc

export async function activate(context: vscode.ExtensionContext) {
    localize = nls.loadMessageBundle()

    ext.context = context
    await activateLogger(context)
    const toolkitOutputChannel = vscode.window.createOutputChannel(localize('AWS.channel.aws.toolkit', 'AWS Toolkit'))

    try {
        initializeCredentialsProviderManager()

        initializeIconPaths(context)
        initializeManifestPaths(context)

        const toolkitSettings = new DefaultSettingsConfiguration(extensionSettingsPrefix)

        const endpointsProvider = makeEndpointsProvider()

        const awsContext = new DefaultAwsContext(context)
        const awsContextTrees = new AwsContextTreeCollection()
        const regionProvider = new DefaultRegionProvider(endpointsProvider)
        const loginManager = new LoginManager(awsContext)

        await initializeAwsCredentialsStatusBarItem(awsContext, context)
        ext.awsContextCommands = new DefaultAWSContextCommands(
            awsContext,
            awsContextTrees,
            regionProvider,
            loginManager
        )
        ext.sdkClientBuilder = new DefaultAWSClientBuilder(awsContext)
        ext.toolkitClientBuilder = new DefaultToolkitClientBuilder()

        await initializeCredentials({
            extensionContext: context,
            awsContext: awsContext,
            settingsConfiguration: toolkitSettings
        })

        ext.telemetry = new DefaultTelemetryService(context, awsContext)
        new AwsTelemetryOptOut(ext.telemetry, toolkitSettings).ensureUserNotified().catch(err => {
            console.warn(`Exception while displaying opt-out message: ${err}`)
        })
        await ext.telemetry.start()

        vscode.commands.registerCommand('aws.login', async () => await ext.awsContextCommands.onCommandLogin())
        vscode.commands.registerCommand('aws.logout', async () => await ext.awsContextCommands.onCommandLogout())

        vscode.commands.registerCommand('aws.credential.profile.create', async () => {
            try {
                await ext.awsContextCommands.onCommandCreateCredentialsProfile()
            } finally {
                recordAwsCreateCredentials()
            }
        })

        // register URLs in extension menu
        vscode.commands.registerCommand('aws.help', async () => {
            vscode.env.openExternal(vscode.Uri.parse(documentationUrl))
            recordAwsHelp()
        })
        vscode.commands.registerCommand('aws.github', async () => {
            vscode.env.openExternal(vscode.Uri.parse(githubUrl))
            recordAwsShowExtensionSource()
        })
        vscode.commands.registerCommand('aws.reportIssue', async () => {
            vscode.env.openExternal(vscode.Uri.parse(reportIssueUrl))
            recordAwsReportPluginIssue()
        })
        vscode.commands.registerCommand('aws.quickStart', async () => {
            try {
                await showQuickStartWebview(context)
            } finally {
                recordAwsHelpQuickstart()
            }
        })

        await activateCdk({
            extensionContext: context
        })

        await activateAwsExplorer({ awsContext, context, awsContextTrees, regionProvider })

        await activateSchemas()

        await ExtensionDisposableFiles.initialize(context)

        await activateServerless({
            awsContext,
            extensionContext: context,
            outputChannel: toolkitOutputChannel,
            regionProvider,
            telemetryService: ext.telemetry,
            toolkitSettings
        })

        toastNewUser(context)

        await loginWithMostRecentCredentials(toolkitSettings, loginManager)
    } catch (error) {
        const channelLogger = getChannelLogger(toolkitOutputChannel)
        channelLogger.error('AWS.channel.aws.toolkit.activation.error', 'Error Activating AWS Toolkit', error as Error)
        throw error
    }
}

export async function deactivate() {
    await ext.telemetry.shutdown()
}

function initializeIconPaths(context: vscode.ExtensionContext) {
    ext.iconPaths.dark.help = context.asAbsolutePath('resources/dark/help.svg')
    ext.iconPaths.light.help = context.asAbsolutePath('resources/light/help.svg')

    ext.iconPaths.dark.cloudFormation = context.asAbsolutePath('resources/dark/cloudformation.svg')
    ext.iconPaths.light.cloudFormation = context.asAbsolutePath('resources/light/cloudformation.svg')

    ext.iconPaths.dark.lambda = context.asAbsolutePath('resources/dark/lambda.svg')
    ext.iconPaths.light.lambda = context.asAbsolutePath('resources/light/lambda.svg')

    ext.iconPaths.dark.settings = context.asAbsolutePath('third-party/resources/from-vscode-icons/dark/gear.svg')
    ext.iconPaths.light.settings = context.asAbsolutePath('third-party/resources/from-vscode-icons/light/gear.svg')

    ext.iconPaths.dark.registry = context.asAbsolutePath('resources/dark/registry.svg')
    ext.iconPaths.light.registry = context.asAbsolutePath('resources/light/registry.svg')

    ext.iconPaths.dark.schema = context.asAbsolutePath('resources/dark/schema.svg')
    ext.iconPaths.light.schema = context.asAbsolutePath('resources/light/schema.svg')
}

function initializeManifestPaths(extensionContext: vscode.ExtensionContext) {
    ext.manifestPaths.endpoints = extensionContext.asAbsolutePath(join('resources', 'endpoints.json'))
    ext.manifestPaths.lambdaSampleRequests = extensionContext.asAbsolutePath(
        join('resources', 'vs-lambda-sample-request-manifest.xml')
    )
}

function initializeCredentialsProviderManager() {
    CredentialsProviderManager.getInstance().addProviderFactory(new SharedCredentialsProviderFactory())
}

function makeEndpointsProvider(): EndpointsProvider {
    const localManifestFetcher = new FileResourceFetcher(ext.manifestPaths.endpoints)
    const remoteManifestFetcher = new HttpResourceFetcher(endpointsFileUrl)

    const provider = new EndpointsProvider(localManifestFetcher, remoteManifestFetcher)
    // tslint:disable-next-line:no-floating-promises -- start the load without waiting. It raises events as fetchers retrieve data.
    provider.load().catch((err: Error) => {
        getLogger().error('Failure while loading Endpoints Manifest', err)

        vscode.window.showErrorMessage(
            localize(
                'AWS.error.endpoint.load.failure',
                'The AWS Toolkit was unable to load endpoints data. Toolkit functionality may be impacted until VS Code is restarted.'
            )
        )
    })

    return provider
}

// Unique extension entrypoint names, so that they can be obtained from the webpack bundle
export const awsToolkitActivate = activate
export const awsToolkitDeactivate = deactivate
