/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { activate as activateAwsExplorer } from './awsexplorer/activation'
import { activate as activateCdk } from './cdk/activation'
import { initialize as initializeCredentials, loginWithMostRecentCredentials } from './credentials/activation'
import { initializeAwsCredentialsStatusBarItem } from './credentials/awsCredentialsStatusBarItem'
import { LoginManager } from './credentials/loginManager'
import { activate as activateSchemas } from './eventSchemas/activation'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'
import { AwsContextTreeCollection } from './shared/awsContextTreeCollection'
import { DefaultToolkitClientBuilder } from './shared/clients/defaultToolkitClientBuilder'
import { documentationUrl, extensionSettingsPrefix, githubUrl, reportIssueUrl } from './shared/constants'
import { DefaultCredentialsFileReaderWriter } from './shared/credentials/defaultCredentialsFileReaderWriter'
import { DefaultAwsContext } from './shared/defaultAwsContext'
import { DefaultAWSContextCommands } from './shared/defaultAwsContextCommands'
import { DefaultResourceFetcher } from './shared/defaultResourceFetcher'
import { ext } from './shared/extensionGlobals'
import { showQuickStartWebview, toastNewUser } from './shared/extensionUtilities'
import { getLogger } from './shared/logger'
import { activate as activateLogger } from './shared/logger/activation'
import { DefaultRegionProvider } from './shared/regions/defaultRegionProvider'
import { activate as activateServerless } from './shared/sam/activation'
import { DefaultSettingsConfiguration } from './shared/settingsConfiguration'
import { AwsTelemetryOptOut } from './shared/telemetry/awsTelemetryOptOut'
import { DefaultTelemetryService } from './shared/telemetry/defaultTelemetryService'
import { registerCommand } from './shared/telemetry/telemetryUtils'
import { ExtensionDisposableFiles } from './shared/utilities/disposableFiles'
import { getChannelLogger } from './shared/utilities/vsCodeUtils'

export async function activate(context: vscode.ExtensionContext) {
    const localize = nls.loadMessageBundle()

    ext.context = context
    await activateLogger(context)
    const toolkitOutputChannel = vscode.window.createOutputChannel(localize('AWS.channel.aws.toolkit', 'AWS Toolkit'))

    try {
        await new DefaultCredentialsFileReaderWriter().setCanUseConfigFileIfExists()
        initializeIconPaths(context)

        const toolkitSettings = new DefaultSettingsConfiguration(extensionSettingsPrefix)
        const awsContext = new DefaultAwsContext(context)
        const awsContextTrees = new AwsContextTreeCollection()
        const resourceFetcher = new DefaultResourceFetcher()
        const regionProvider = new DefaultRegionProvider(context, resourceFetcher)
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

        registerCommand({
            command: 'aws.login',
            callback: async () => await ext.awsContextCommands.onCommandLogin(),
            telemetryName: 'aws_credentialslogin'
        })

        registerCommand({
            command: 'aws.credential.profile.create',
            callback: async () => await ext.awsContextCommands.onCommandCreateCredentialsProfile(),
            telemetryName: 'aws_credentialscreate'
        })

        registerCommand({
            command: 'aws.logout',
            callback: async () => await ext.awsContextCommands.onCommandLogout(),
            telemetryName: 'aws_credentialslogout'
        })

        // register URLs in extension menu
        registerCommand({
            command: 'aws.help',
            callback: async () => {
                vscode.env.openExternal(vscode.Uri.parse(documentationUrl))
            },
            telemetryName: 'Command_aws.help'
        })
        registerCommand({
            command: 'aws.github',
            callback: async () => {
                vscode.env.openExternal(vscode.Uri.parse(githubUrl))
            },
            telemetryName: 'Command_aws.github'
        })
        registerCommand({
            command: 'aws.reportIssue',
            callback: async () => {
                vscode.env.openExternal(vscode.Uri.parse(reportIssueUrl))
            },
            telemetryName: 'Command_aws.reportIssue'
        })
        registerCommand({
            command: 'aws.quickStart',
            callback: async () => {
                await showQuickStartWebview(context)
            },
            telemetryName: 'Command_aws.quickStart'
        })

        await activateCdk({
            extensionContext: context
        })

        await activateAwsExplorer({ awsContext, context, awsContextTrees, regionProvider, resourceFetcher })

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

        toastNewUser(context, getLogger())

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

// Unique extension entrypoint names, so that they can be obtained from the webpack bundle
export const awsToolkitActivate = activate
export const awsToolkitDeactivate = deactivate
