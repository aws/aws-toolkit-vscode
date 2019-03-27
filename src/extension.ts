/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { resumeCreateNewSamApp } from './lambda/commands/createNewSamApp'
import { SamParameterCompletionItemProvider } from './lambda/config/samParameterCompletionItemProvider'
import { RegionNode } from './lambda/explorer/regionNode'
import { LambdaTreeDataProvider } from './lambda/lambdaTreeDataProvider'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'
import { AwsContextTreeCollection } from './shared/awsContextTreeCollection'
import { DefaultToolkitClientBuilder } from './shared/clients/defaultToolkitClientBuilder'
import * as pyLensProvider from './shared/codelens/pythonCodeLensProvider'
import * as tsLensProvider from './shared/codelens/typescriptCodeLensProvider'
import { documentationUrl, extensionSettingsPrefix, githubUrl } from './shared/constants'
import { DefaultCredentialsFileReaderWriter } from './shared/credentials/defaultCredentialsFileReaderWriter'
import { DefaultAwsContext } from './shared/defaultAwsContext'
import { DefaultAWSContextCommands } from './shared/defaultAwsContextCommands'
import { DefaultResourceFetcher } from './shared/defaultResourceFetcher'
import { EnvironmentVariables } from './shared/environmentVariables'
import { ext } from './shared/extensionGlobals'
import { safeGet } from './shared/extensionUtilities'
import * as logFactory from './shared/logger'
import { DefaultRegionProvider } from './shared/regions/defaultRegionProvider'
import * as SamCliDetection from './shared/sam/cli/samCliDetection'
import { DefaultSettingsConfiguration, SettingsConfiguration } from './shared/settingsConfiguration'
import { AWSStatusBar } from './shared/statusBar'
import { AwsTelemetryOptOut } from './shared/telemetry/awsTelemetryOptOut'
import { DefaultTelemetryService } from './shared/telemetry/defaultTelemetryService'
import { registerCommand } from './shared/telemetry/telemetryUtils'
import { ExtensionDisposableFiles } from './shared/utilities/disposableFiles'
import { PromiseSharer } from './shared/utilities/promiseUtilities'
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
    await logFactory.initialize()
    const toolkitOutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.toolkit', 'AWS Toolkit')
    )

    try {
        await new DefaultCredentialsFileReaderWriter().setCanUseConfigFileIfExists()

        const awsContext = new DefaultAwsContext(new DefaultSettingsConfiguration(extensionSettingsPrefix), context)
        const awsContextTrees = new AwsContextTreeCollection()
        const resourceFetcher = new DefaultResourceFetcher()
        const regionProvider = new DefaultRegionProvider(context, resourceFetcher)

        ext.awsContextCommands = new DefaultAWSContextCommands(awsContext, awsContextTrees, regionProvider)
        ext.sdkClientBuilder = new DefaultAWSClientBuilder(awsContext)
        ext.toolkitClientBuilder = new DefaultToolkitClientBuilder()
        ext.statusBar = new AWSStatusBar(awsContext, context)
        ext.telemetry = new DefaultTelemetryService(context)
        new AwsTelemetryOptOut(ext.telemetry, new DefaultSettingsConfiguration(extensionSettingsPrefix))
            .ensureUserNotified()
            .catch((err) => {
                console.warn(`Exception while displaying opt-out message: ${err}`)
            })
        await ext.telemetry.start()

        context.subscriptions.push(...activateCodeLensProviders(awsContext.settingsConfiguration, toolkitOutputChannel))

        registerCommand({
            command: 'aws.login',
            callback: async () => await ext.awsContextCommands.onCommandLogin()
        })

        registerCommand({
            command: 'aws.credential.profile.create',
            callback: async () => await ext.awsContextCommands.onCommandCreateCredentialsProfile()
        })

        registerCommand({
            command: 'aws.logout',
            callback: async () => await ext.awsContextCommands.onCommandLogout()
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
        vscode.commands.registerCommand(
            'aws.help',
            () => { vscode.env.openExternal(vscode.Uri.parse(documentationUrl)) }
        )
        vscode.commands.registerCommand(
            'aws.github',
            () => { vscode.env.openExternal(vscode.Uri.parse(githubUrl)) }
        )

        const providers = [
            new LambdaTreeDataProvider(
                awsContext,
                awsContextTrees,
                regionProvider,
                resourceFetcher,
                (relativeExtensionPath) => getExtensionAbsolutePath(context, relativeExtensionPath)
            )
        ]

        providers.forEach((p) => {
            p.initialize(context)
            context.subscriptions.push(vscode.window.registerTreeDataProvider(p.viewProviderId, p))
        })

        await ext.statusBar.updateContext(undefined)

        await initializeSamCli()

        await ExtensionDisposableFiles.initialize(context)

        vscode.languages.registerCompletionItemProvider(
            {
                language: 'json',
                scheme: 'file',
                pattern: '**/.aws/parameters.json'
            },
            new SamParameterCompletionItemProvider(),
            '"'
        )

        await resumeCreateNewSamApp(context)
    } catch (error) {
        const channelLogger = getChannelLogger(toolkitOutputChannel)
        channelLogger.error(
            'AWS.channel.aws.toolkit.activation.error',
            'Error Activating AWS Toolkit',
            error as Error
        )
        throw error
    }
}

export async function deactivate() {
    await ext.telemetry.shutdown()
}

function activateCodeLensProviders(
    configuration: SettingsConfiguration,
    toolkitOutputChannel: vscode.OutputChannel
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = []
    const providerParams = {
        configuration,
        toolkitOutputChannel
    }

    tsLensProvider.initialize(providerParams)

    disposables.push(
        vscode.languages.registerCodeLensProvider(
            [
                {
                    language: 'javascript',
                    scheme: 'file',
                },
            ],
            tsLensProvider.makeTypescriptCodeLensProvider()
        )
    )

    // TODO : Python CodeLenses will be disabled until feature/python-debugging is complete
    if (false) {
        pyLensProvider.initialize(providerParams)
        disposables.push(vscode.languages.registerCodeLensProvider(
            pyLensProvider.PYTHON_ALLFILES,
            pyLensProvider.makePythonCodeLensProvider()
        ))
    }

    return disposables
}

/**
 * Performs SAM CLI relevant extension initialization
 */
async function initializeSamCli(): Promise<void> {
    registerCommand({
        command: 'aws.samcli.detect',
        callback: async () => await PromiseSharer.getExistingPromiseOrCreate(
            'samcli.detect',
            async () => await SamCliDetection.detectSamCli(true)
        )
    })

    await SamCliDetection.detectSamCli(false)
}

function getExtensionAbsolutePath(context: vscode.ExtensionContext, relativeExtensionPath: string): string {
    return context.asAbsolutePath(relativeExtensionPath)
}
