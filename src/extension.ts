/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { AwsExplorer } from './awsexplorer/awsExplorer'
import { RegionNode } from './awsexplorer/regionNode'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'
import { AwsContextTreeCollection } from './shared/awsContextTreeCollection'
import { DefaultToolkitClientBuilder } from './shared/clients/defaultToolkitClientBuilder'
import { documentationUrl, extensionSettingsPrefix, githubUrl, reportIssueUrl } from './shared/constants'
import { DefaultCredentialsFileReaderWriter } from './shared/credentials/defaultCredentialsFileReaderWriter'
import { UserCredentialsUtils } from './shared/credentials/userCredentialsUtils'
import { DefaultAwsContext } from './shared/defaultAwsContext'
import { DefaultAWSContextCommands } from './shared/defaultAwsContextCommands'
import { DefaultResourceFetcher } from './shared/defaultResourceFetcher'
import { DefaultAWSStatusBar } from './shared/defaultStatusBar'
import { EnvironmentVariables } from './shared/environmentVariables'
import { ext } from './shared/extensionGlobals'
import { safeGet, showQuickStartWebview, toastNewUser } from './shared/extensionUtilities'
import { getLogger } from './shared/logger'
import { activate as activateLogger } from './shared/logger/activation'
import { DefaultRegionProvider } from './shared/regions/defaultRegionProvider'
import { activate as activateServerless } from './shared/sam/activation'
import { DefaultSettingsConfiguration } from './shared/settingsConfiguration'
import { AwsTelemetryOptOut } from './shared/telemetry/awsTelemetryOptOut'
import { DefaultTelemetryService } from './shared/telemetry/defaultTelemetryService'
import { TelemetryNamespace } from './shared/telemetry/telemetryTypes'
import { registerCommand } from './shared/telemetry/telemetryUtils'
import { ExtensionDisposableFiles } from './shared/utilities/disposableFiles'
import { getChannelLogger } from './shared/utilities/vsCodeUtils'

export async function activate(context: vscode.ExtensionContext) {
    const env = process.env as EnvironmentVariables
    if (!!env.VSCODE_NLS_CONFIG) {
        nls.config(JSON.parse(env.VSCODE_NLS_CONFIG) as nls.Options)()
    } else {
        nls.config()()
    }

    const localize = nls.loadMessageBundle()

    ext.context = context
    await activateLogger()
    const toolkitOutputChannel = vscode.window.createOutputChannel(localize('AWS.channel.aws.toolkit', 'AWS Toolkit'))

    try {
        await new DefaultCredentialsFileReaderWriter().setCanUseConfigFileIfExists()
        initializeIconPaths(context)

        const toolkitSettings = new DefaultSettingsConfiguration(extensionSettingsPrefix)
        const awsContext = new DefaultAwsContext(toolkitSettings, context)
        const awsContextTrees = new AwsContextTreeCollection()
        const resourceFetcher = new DefaultResourceFetcher()
        const regionProvider = new DefaultRegionProvider(context, resourceFetcher)

        ext.awsContextCommands = new DefaultAWSContextCommands(awsContext, awsContextTrees, regionProvider)
        ext.sdkClientBuilder = new DefaultAWSClientBuilder(awsContext)
        ext.toolkitClientBuilder = new DefaultToolkitClientBuilder()

        // check to see if current user is valid
        const currentProfile = awsContext.getCredentialProfileName()
        if (currentProfile) {
            const successfulLogin = await UserCredentialsUtils.addUserDataToContext(currentProfile, awsContext)
            if (!successfulLogin) {
                await UserCredentialsUtils.removeUserDataFromContext(awsContext)
                // tslint:disable-next-line: no-floating-promises
                UserCredentialsUtils.notifyUserCredentialsAreBad(currentProfile)
            }
        }

        ext.statusBar = new DefaultAWSStatusBar(awsContext, context)
        ext.telemetry = new DefaultTelemetryService(context, awsContext)
        new AwsTelemetryOptOut(ext.telemetry, toolkitSettings).ensureUserNotified().catch(err => {
            console.warn(`Exception while displaying opt-out message: ${err}`)
        })
        await ext.telemetry.start()

        registerCommand({
            command: 'aws.login',
            callback: async () => await ext.awsContextCommands.onCommandLogin(),
            telemetryName: {
                namespace: TelemetryNamespace.Aws,
                name: 'credentialslogin'
            }
        })

        registerCommand({
            command: 'aws.credential.profile.create',
            callback: async () => await ext.awsContextCommands.onCommandCreateCredentialsProfile(),
            telemetryName: {
                namespace: TelemetryNamespace.Aws,
                name: 'credentialscreate'
            }
        })

        registerCommand({
            command: 'aws.logout',
            callback: async () => await ext.awsContextCommands.onCommandLogout(),
            telemetryName: {
                namespace: TelemetryNamespace.Aws,
                name: 'credentialslogout'
            }
        })

        registerCommand({
            command: 'aws.showRegion',
            callback: async () => await ext.awsContextCommands.onCommandShowRegion()
        })

        registerCommand({
            command: 'aws.hideRegion',
            callback: async (node?: RegionNode) => {
                await ext.awsContextCommands.onCommandHideRegion(safeGet(node, x => x.regionCode))
            }
        })

        // register URLs in extension menu
        registerCommand({
            command: 'aws.help',
            callback: async () => {
                vscode.env.openExternal(vscode.Uri.parse(documentationUrl))
            }
        })
        registerCommand({
            command: 'aws.github',
            callback: async () => {
                vscode.env.openExternal(vscode.Uri.parse(githubUrl))
            }
        })
        registerCommand({
            command: 'aws.reportIssue',
            callback: async () => {
                vscode.env.openExternal(vscode.Uri.parse(reportIssueUrl))
            }
        })
        registerCommand({
            command: 'aws.quickStart',
            callback: async () => {
                await showQuickStartWebview(context)
            }
        })

        const providers = [new AwsExplorer(awsContext, awsContextTrees, regionProvider, resourceFetcher)]

        providers.forEach(p => {
            p.initialize(context)
            context.subscriptions.push(vscode.window.registerTreeDataProvider(p.viewProviderId, p))
        })

        await ext.statusBar.updateContext(undefined)

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
}
