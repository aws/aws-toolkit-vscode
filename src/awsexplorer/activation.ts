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
import {
    recordAwsHideRegion,
    recordAwsRefreshExplorer,
    recordAwsShowRegion,
    recordVscodeActiveRegions
} from '../shared/telemetry/telemetry'
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
}): Promise<void> {
    const awsExplorer = new AwsExplorer(activateArguments.awsContext, activateArguments.regionProvider)

    activateArguments.context.subscriptions.push(
        vscode.window.registerTreeDataProvider(awsExplorer.viewProviderId, awsExplorer)
    )

    await registerAwsExplorerCommands(awsExplorer)

    recordVscodeActiveRegions({ value: awsExplorer.getRegionNodesSize() })

    activateArguments.awsContextTrees.addTree(awsExplorer)

    updateAwsExplorerWhenAwsContextCredentialsChange(
        awsExplorer,
        activateArguments.awsContext,
        activateArguments.context
    )
}

async function registerAwsExplorerCommands(
    awsExplorer: AwsExplorer,
    lambdaOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Lambda')
): Promise<void> {
    vscode.commands.registerCommand('aws.showRegion', async () => {
        try {
            await ext.awsContextCommands.onCommandShowRegion()
        } finally {
            recordAwsShowRegion()
            recordVscodeActiveRegions({ value: awsExplorer.getRegionNodesSize() })
        }
    })

    vscode.commands.registerCommand('aws.hideRegion', async (node?: RegionNode) => {
        try {
            await ext.awsContextCommands.onCommandHideRegion(safeGet(node, x => x.regionCode))
        } finally {
            recordAwsHideRegion()
            recordVscodeActiveRegions({ value: awsExplorer.getRegionNodesSize() })
        }
    })

    vscode.commands.registerCommand('aws.refreshAwsExplorer', async () => {
        recordAwsRefreshExplorer()
        awsExplorer.refresh()
    })

    vscode.commands.registerCommand(
        'aws.deleteLambda',
        async (node: LambdaFunctionNode) =>
            await deleteLambda({
                deleteParams: { functionName: node.configuration.FunctionName || '' },
                lambdaClient: ext.toolkitClientBuilder.createLambdaClient(node.regionCode),
                outputChannel: lambdaOutputChannel,
                onRefresh: () => awsExplorer.refresh(node.parent)
            })
    )

    vscode.commands.registerCommand(
        'aws.deleteCloudFormation',
        async (node: CloudFormationStackNode) =>
            await deleteCloudFormation(() => awsExplorer.refresh(node.parent), node)
    )

    vscode.commands.registerCommand('aws.showErrorDetails', async (node: ErrorNode) => await showErrorDetails(node))

    vscode.commands.registerCommand(
        'aws.invokeLambda',
        async (node: LambdaFunctionNode) =>
            await invokeLambda({
                functionNode: node,
                outputChannel: lambdaOutputChannel
            })
    )

    vscode.commands.registerCommand(
        'aws.refreshAwsExplorerNode',
        async (awsexplorer: AwsExplorer, element: AWSTreeNodeBase) => {
            try {
                awsexplorer.refresh(element)
            } finally {
                recordAwsRefreshExplorer()
            }
        }
    )
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
