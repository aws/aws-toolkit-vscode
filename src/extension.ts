/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { LambdaProvider } from './lambda/lambdaProvider'
import { AWSClientBuilder } from './shared/awsClientBuilder'
import { ext } from './shared/extensionGlobals'
import { extensionSettingsPrefix } from './shared/constants'
import { DefaultAwsContext } from './shared/defaultAwsContext'
import { DefaultSettingsConfiguration } from './shared/settingsConfiguration'
import { AWSStatusBar } from './shared/statusBar'
import { DefaultAWSContextCommands } from './shared/defaultAwsContextCommands'
import { RegionNode } from './lambda/explorer/regionNode'
import { safeGet } from './shared/extensionUtilities'
import { AwsContextTreeCollection } from './shared/awsContextTreeCollection'
import { DefaultRegionProvider } from './shared/regions/defaultRegionProvider'
import { DefaultResourceFetcher } from './shared/defaultResourceFetcher'
import { DefaultCredentialsFileReaderWriter } from './shared/credentials/defaultCredentialsFileReaderWriter'

export async function activate(context: vscode.ExtensionContext) {

    nls.config(process.env.VSCODE_NLS_CONFIG)()

    ext.lambdaOutputChannel = vscode.window.createOutputChannel('AWS Lambda')
    ext.context = context

    new DefaultCredentialsFileReaderWriter().setCanUseConfigFile(true)

    const awsContext = new DefaultAwsContext(new DefaultSettingsConfiguration(extensionSettingsPrefix))
    const awsContextTrees = new AwsContextTreeCollection()
    const resourceFetcher = new DefaultResourceFetcher()
    const regionProvider = new DefaultRegionProvider(context, resourceFetcher)

    ext.awsContextCommands = new DefaultAWSContextCommands(awsContext, awsContextTrees, regionProvider)
    ext.sdkClientBuilder = new AWSClientBuilder(awsContext)
    ext.statusBar = new AWSStatusBar(awsContext, context)

    vscode.commands.registerCommand('aws.login', async () => { await ext.awsContextCommands.onCommandLogin() })
    vscode.commands.registerCommand('aws.logout', async () => { await ext.awsContextCommands.onCommandLogout() })

    vscode.commands.registerCommand('aws.showRegion', async () => { await ext.awsContextCommands.onCommandShowRegion() })
    vscode.commands.registerCommand('aws.hideRegion', async (node?: RegionNode) => { await ext.awsContextCommands.onCommandHideRegion(safeGet(node, x => x.regionCode)) })

    const providers = [
        new LambdaProvider(awsContext, awsContextTrees, regionProvider, resourceFetcher)
    ]

    providers.forEach((p) => {
        p.initialize()
        context.subscriptions.push(vscode.window.registerTreeDataProvider(p.viewProviderId, p))
    })

    ext.statusBar.updateContext(undefined)
}

export function deactivate() {
}
