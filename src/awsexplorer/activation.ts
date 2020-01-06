/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { deleteCloudFormation } from '../lambda/commands/deleteCloudFormation'
import { deleteLambda } from '../lambda/commands/deleteLambda'
import { invokeLambda } from '../lambda/commands/invokeLambda'
import { CloudFormationStackNode } from '../lambda/explorer/cloudFormationNodes'
import { LambdaFunctionNode } from '../lambda/explorer/lambdaFunctionNode'
import { AwsContext } from '../shared/awsContext'
import { AwsContextTreeCollection } from '../shared/awsContextTreeCollection'
import { ext } from '../shared/extensionGlobals'
import { safeGet } from '../shared/extensionUtilities'
import { getLogger } from '../shared/logger'
import { RegionProvider } from '../shared/regions/regionProvider'
import { ResourceFetcher } from '../shared/resourceFetcher'
import { registerCommand } from '../shared/telemetry/telemetryUtils'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../shared/treeview/nodes/errorNode'
import { showErrorDetails } from '../shared/treeview/webviews/showErrorDetails'
import { AwsExplorer } from './awsExplorer'
import { checkExplorerForDefaultRegion } from './defaultRegion'
import { RegionNode } from './regionNode'

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

    await registerAwsExplorerCommands(awsExplorer, activateArguments.awsContext, activateArguments.resourceFetcher)

    await recordNumberOfActiveRegionsMetric(awsExplorer)

    activateArguments.awsContextTrees.addTree(awsExplorer)

    updateAwsExplorerWhenAwsContextCredentialsChange(
        awsExplorer,
        activateArguments.awsContext,
        activateArguments.context
    )
}

async function registerAwsExplorerCommands(
    awsExplorer: AwsExplorer,
    awsContext: AwsContext,
    resourceFetcher: ResourceFetcher,
    lambdaOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Lambda')
): Promise<void> {
    registerCommand({
        command: 'aws.showRegion',
        callback: async () => {
            await ext.awsContextCommands.onCommandShowRegion()
            await recordNumberOfActiveRegionsMetric(awsExplorer)
        },
        telemetryName: 'Command_aws.showRegion'
    })

    registerCommand({
        command: 'aws.hideRegion',
        callback: async (node?: RegionNode) => {
            await ext.awsContextCommands.onCommandHideRegion(safeGet(node, x => x.regionCode))
            await recordNumberOfActiveRegionsMetric(awsExplorer)
        },
        telemetryName: 'Command_aws.hideRegion'
    })

    registerCommand({
        command: 'aws.refreshAwsExplorer',
        callback: async () => awsExplorer.refresh(),
        telemetryName: 'Command_aws.refreshAwsExplorer'
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
        telemetryName: 'lambda_delete'
    })

    registerCommand({
        command: 'aws.deleteCloudFormation',
        callback: async (node: CloudFormationStackNode) =>
            await deleteCloudFormation(() => awsExplorer.refresh(node.parent), node),
        telemetryName: 'cloudformation_delete'
    })

    registerCommand({
        command: 'aws.showErrorDetails',
        callback: async (node: ErrorNode) => await showErrorDetails(node),
        telemetryName: 'Command_aws.showErrorDetails'
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
        telemetryName: 'lambda_invokeremote'
    })

    registerCommand({
        command: 'aws.refreshAwsExplorerNode',
        callback: async (awsexplorer: AwsExplorer, element: AWSTreeNodeBase) => {
            awsexplorer.refresh(element)
        },
        telemetryName: 'Command_aws.refreshAwsExplorerNode'
    })
}

async function recordNumberOfActiveRegionsMetric(awsExplorer: AwsExplorer) {
    const numOfActiveRegions = awsExplorer.getRegionNodesSize()
    const currTime = new Date()

    ext.telemetry.record({
        createTime: currTime,
        data: [{ name: 'vscode_activeregions', value: numOfActiveRegions, unit: 'Count' }]
    })
}

function updateAwsExplorerWhenAwsContextCredentialsChange(
    awsExplorer: AwsExplorer,
    awsContext: AwsContext,
    extensionContext: vscode.ExtensionContext
) {
    extensionContext.subscriptions.push(
        awsContext.onDidChangeContext(async credentialsChangedEvent => {
            getLogger().verbose(`Credentials changed (${credentialsChangedEvent.profileName}), updating AWS Explorer`)
            awsExplorer.refresh()

            if (credentialsChangedEvent.profileName) {
                await checkExplorerForDefaultRegion(credentialsChangedEvent.profileName, awsContext, awsExplorer)
            }
        })
    )
}
