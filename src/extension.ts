/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { deleteCloudFormation } from './lambda/commands/deleteCloudFormation'
import { CloudFormationNode } from './lambda/explorer/cloudFormationNode'
import { RegionNode } from './lambda/explorer/regionNode'
import { LambdaProvider } from './lambda/lambdaProvider'
import { NodeDebugConfigurationProvider } from './lambda/local/debugConfigurationProvider'
import { AWSClientBuilder } from './shared/awsClientBuilder'
import { AwsContextTreeCollection } from './shared/awsContextTreeCollection'
import { TypescriptCodeLensProvider } from './shared/codelens/typescriptCodeLensProvider'
import { extensionSettingsPrefix } from './shared/constants'
import { DefaultCredentialsFileReaderWriter } from './shared/credentials/defaultCredentialsFileReaderWriter'
import { DefaultAwsContext } from './shared/defaultAwsContext'
import { DefaultAWSContextCommands } from './shared/defaultAwsContextCommands'
import { DefaultResourceFetcher } from './shared/defaultResourceFetcher'
import { EnvironmentVariables } from './shared/environmentVariables'
import { ext } from './shared/extensionGlobals'
import { safeGet } from './shared/extensionUtilities'
import { DefaultRegionProvider } from './shared/regions/defaultRegionProvider'
import * as SamCliDetection from './shared/sam/cli/samCliDetection'
import { SamCliVersionValidator } from './shared/sam/cli/samCliVersionValidator'
import { DefaultSettingsConfiguration } from './shared/settingsConfiguration'
import { AWSStatusBar } from './shared/statusBar'
import { ExtensionDisposableFiles } from './shared/utilities/disposableFiles'
import { PromiseSharer } from './shared/utilities/promiseUtilities'

export async function activate(context: vscode.ExtensionContext) {

    const env = process.env as EnvironmentVariables
    if (!!env.VSCODE_NLS_CONFIG) {
        nls.config(JSON.parse(env.VSCODE_NLS_CONFIG) as nls.Options)()
    } else {
        nls.config()()
    }

    const localize = nls.loadMessageBundle()

    ext.lambdaOutputChannel = vscode.window.createOutputChannel('AWS Lambda')
    ext.context = context

    const toolkitOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.toolkit', 'AWS Toolkit')
    )

    await new DefaultCredentialsFileReaderWriter().setCanUseConfigFileIfExists()

    const awsContext = new DefaultAwsContext(new DefaultSettingsConfiguration(extensionSettingsPrefix))
    const awsContextTrees = new AwsContextTreeCollection()
    const resourceFetcher = new DefaultResourceFetcher()
    const regionProvider = new DefaultRegionProvider(context, resourceFetcher)

    ext.awsContextCommands = new DefaultAWSContextCommands(awsContext, awsContextTrees, regionProvider)
    ext.sdkClientBuilder = new AWSClientBuilder(awsContext)
    ext.statusBar = new AWSStatusBar(awsContext, context)

    context.subscriptions.push(...activateCodeLensProviders(toolkitOutputChannel))

    vscode.commands.registerCommand('aws.login', async () => await ext.awsContextCommands.onCommandLogin())
    vscode.commands.registerCommand(
        'aws.credential.profile.create',
        async () => await ext.awsContextCommands.onCommandCreateCredentialsProfile()
    )
    vscode.commands.registerCommand('aws.logout', async () => await ext.awsContextCommands.onCommandLogout())

    vscode.commands.registerCommand(
        'aws.showRegion',
        async () => await ext.awsContextCommands.onCommandShowRegion()
    )
    vscode.commands.registerCommand(
        'aws.hideRegion',
        async (node?: RegionNode) => await ext.awsContextCommands.onCommandHideRegion(safeGet(node, x => x.regionCode))
    )

    vscode.commands.registerCommand(
        'aws.deleteCloudFormation',
        async (node: CloudFormationNode) => await deleteCloudFormation(node))

    const providers = [
        new LambdaProvider(awsContext, awsContextTrees, regionProvider, resourceFetcher)
    ]

    providers.forEach((p) => {
        p.initialize()
        context.subscriptions.push(vscode.window.registerTreeDataProvider(p.viewProviderId, p))
    })

    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider(
        'lambda-node',
        new NodeDebugConfigurationProvider()
    ))

    await ext.statusBar.updateContext(undefined)

    await initializeSamCli()

    await ExtensionDisposableFiles.initialize(context)
}

export function deactivate() {
}

function activateCodeLensProviders(
    toolkitOutputChannel: vscode.OutputChannel
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = []

    TypescriptCodeLensProvider.initialize(toolkitOutputChannel)

    disposables.push(
        vscode.languages.registerCodeLensProvider(
            [
                {
                    language: 'javascript',
                    scheme: 'file',
                },
                {
                    language: 'typescript',
                    scheme: 'file',
                }
            ],
            new TypescriptCodeLensProvider()
        )
    )

    return disposables
}

/**
 * Performs SAM CLI relevant extension initialization
 */
async function initializeSamCli(): Promise<void> {
    vscode.commands.registerCommand(
        'aws.samcli.detect',
        async () => await PromiseSharer.getExistingPromiseOrCreate(
            'samcli.detect',
            async () => await SamCliDetection.detectSamCli(true)
        )
    )

    vscode.commands.registerCommand(
        'aws.samcli.validate.version',
        async () => {
            const samCliVersionValidator = new SamCliVersionValidator()
            await samCliVersionValidator.validateAndNotify()
        }
    )

    await SamCliDetection.detectSamCli(false)
}
