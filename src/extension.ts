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
import { AWSContextCommands } from './shared/awsContextCommands'
import { RegionNode } from './lambda/explorer/regionNode'
import { safeGet } from './shared/extensionUtilities'
import { AwsContextTreeCollection } from './shared/awsContextTreeCollection'
import { DefaultRegionProvider } from './shared/regions/defaultRegionProvider'
import { DefaultResourceFetcher } from './shared/defaultResourceFetcher'

export async function activate(context: vscode.ExtensionContext) {

    nls.config(process.env.VSCODE_NLS_CONFIG)()

    ext.context = context
    const awsContext = new DefaultAwsContext(new DefaultSettingsConfiguration(extensionSettingsPrefix))
    const awsContextTrees = new AwsContextTreeCollection()
    const resourceFetcher = new DefaultResourceFetcher()
    const regionProvider = new DefaultRegionProvider(context, resourceFetcher)

    ext.awsContextCommands = new AWSContextCommands(awsContext, awsContextTrees, regionProvider)
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
