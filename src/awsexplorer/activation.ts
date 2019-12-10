/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { AwsExplorer } from './awsExplorer'
import { AwsContext } from '../shared/awsContext'
import { AwsContextTreeCollection } from '../shared/awsContextTreeCollection'
import { RegionProvider } from '../shared/regions/regionProvider'
import { ResourceFetcher } from '../shared/resourceFetcher'
import { ext } from '../shared/extensionGlobals'
import { registerCommand } from '../shared/telemetry/telemetryUtils'
import { RegionNode } from './regionNode'
import { safeGet } from '../shared/extensionUtilities'
import { LambdaFunctionNode } from '../lambda/explorer/lambdaFunctionNode'
import { deleteLambda } from '../lambda/commands/deleteLambda'
import { TelemetryNamespace } from '../shared/telemetry/telemetryTypes'
import { CloudFormationStackNode } from '../lambda/explorer/cloudFormationNodes'
import { deleteCloudFormation } from '../lambda/commands/deleteCloudFormation'
import { ErrorNode } from '../shared/treeview/nodes/errorNode'
import { showErrorDetails } from '../shared/treeview/webviews/showErrorDetails'
import { invokeLambda } from '../lambda/commands/invokeLambda'
import { configureLocalLambda } from '../lambda/local/configureLocalLambda'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'

/**
 * Activate AWS Explorer related functionality for the extension.
 */

export async function activate(activateArguments: {
    awsContext: AwsContext
    context: vscode.ExtensionContext
    awsContextTrees: AwsContextTreeCollection
    regionProvider: RegionProvider
    resourceFetcher: ResourceFetcher
}): Promise<void> {
    const awsExplorer = new AwsExplorer(activateArguments.awsContext, activateArguments.regionProvider)

    activateArguments.context.subscriptions.push(
        vscode.window.registerTreeDataProvider(awsExplorer.viewProviderId, awsExplorer)
    )

    registerAwsExplorerCommands(awsExplorer, activateArguments.awsContext, activateArguments.resourceFetcher)

    activateArguments.awsContextTrees.addTree(awsExplorer)
}

async function registerAwsExplorerCommands(
    awsExplorer: AwsExplorer,
    awsContext: AwsContext,
    resourceFetcher: ResourceFetcher,
    lambdaOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Lambda')
): Promise<void> {
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

    registerCommand({
        command: 'aws.refreshAwsExplorer',
        callback: async () => awsExplorer.refresh()
    })

    registerCommand({
        command: 'aws.deleteLambda',
        callback: async (node: LambdaFunctionNode) =>
            await deleteLambda({
                deleteParams: { functionName: node.configuration.FunctionName || '' },
                lambdaClient: ext.toolkitClientBuilder.createLambdaClient(node.regionCode),
                outputChannel: lambdaOutputChannel,
                onRefresh: () => awsExplorer.refresh(node.parent)
            }),
        telemetryName: {
            namespace: TelemetryNamespace.Lambda,
            name: 'delete'
        }
    })

    registerCommand({
        command: 'aws.deleteCloudFormation',
        callback: async (node: CloudFormationStackNode) =>
            await deleteCloudFormation(() => awsExplorer.refresh(node.parent), node),
        telemetryName: {
            namespace: TelemetryNamespace.Cloudformation,
            name: 'delete'
        }
    })

    registerCommand({
        command: 'aws.showErrorDetails',
        callback: async (node: ErrorNode) => await showErrorDetails(node)
    })

    registerCommand({
        command: 'aws.invokeLambda',
        callback: async (node: LambdaFunctionNode) =>
            await invokeLambda({
                awsContext: awsContext,
                functionNode: node,
                outputChannel: lambdaOutputChannel,
                resourceFetcher: resourceFetcher
            }),
        telemetryName: {
            namespace: TelemetryNamespace.Lambda,
            name: 'invokeremote'
        }
    })

    registerCommand({
        command: 'aws.configureLambda',
        callback: configureLocalLambda,
        telemetryName: {
            namespace: TelemetryNamespace.Lambda,
            name: 'configurelocal'
        }
    })

    registerCommand({
        command: 'aws.refreshAwsExplorerNode',
        callback: async (awsExplorer: AwsExplorer, element: AWSTreeNodeBase) => {
            awsExplorer.refresh(element)
        }
    })
}
