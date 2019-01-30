/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { RegionNode } from './lambda/explorer/regionNode'
import { LambdaTreeDataProvider } from './lambda/lambdaTreeDataProvider'
import { NodeDebugConfigurationProvider } from './lambda/local/debugConfigurationProvider'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'
import { AwsContextTreeCollection } from './shared/awsContextTreeCollection'
import { DefaultToolkitClientBuilder } from './shared/clients/defaultToolkitClientBuilder'
import { extensionSettingsPrefix } from './shared/constants'
import { DefaultCredentialsFileReader } from './shared/credentials/defaultCredentialsFileReader'
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
import { PromiseSharer } from './shared/utilities/promiseUtilities'

export async function activate(context: vscode.ExtensionContext) {

    const env = process.env as EnvironmentVariables
    if (!!env.VSCODE_NLS_CONFIG) {
        nls.config(JSON.parse(env.VSCODE_NLS_CONFIG) as nls.Options)()
    } else {
        nls.config()()
    }

    ext.lambdaOutputChannel = vscode.window.createOutputChannel('AWS Lambda')
    ext.context = context

    await new DefaultCredentialsFileReader().setCanUseConfigFileIfExists()

    const awsContext = new DefaultAwsContext(new DefaultSettingsConfiguration(extensionSettingsPrefix))
    const awsContextTrees = new AwsContextTreeCollection()
    const resourceFetcher = new DefaultResourceFetcher()
    const regionProvider = new DefaultRegionProvider(context, resourceFetcher)

    ext.awsContextCommands = new DefaultAWSContextCommands(awsContext, awsContextTrees, regionProvider)
    ext.sdkClientBuilder = new DefaultAWSClientBuilder(awsContext)
    ext.toolkitClientBuilder = new DefaultToolkitClientBuilder()
    ext.statusBar = new AWSStatusBar(awsContext, context)

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

    const providers = [
        new LambdaTreeDataProvider(awsContext, awsContextTrees, regionProvider, resourceFetcher)
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
}

export function deactivate() {
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
