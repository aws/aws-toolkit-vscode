/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { submitFeedback } from '../feedback/commands/submitFeedback'
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
    recordVscodeActiveRegions,
} from '../shared/telemetry/telemetry'
import { AWSResourceNode } from '../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../shared/treeview/nodes/errorNode'
import { LoadMoreNode } from '../shared/treeview/nodes/loadMoreNode'
import { showErrorDetails } from '../shared/treeview/webviews/showErrorDetails'
import { downloadStateMachineDefinition } from '../stepFunctions/commands/downloadStateMachineDefinition'
import { executeStateMachine } from '../stepFunctions/commands/executeStateMachine'
import { StateMachineNode } from '../stepFunctions/explorer/stepFunctionsNodes'
import { AwsExplorer } from './awsExplorer'
import { copyArnCommand } from './commands/copyArn'
import { copyNameCommand } from './commands/copyName'
import { loadMoreChildrenCommand } from './commands/loadMoreChildren'
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
    outputChannel: vscode.OutputChannel
}): Promise<void> {
    const awsExplorer = new AwsExplorer(
        activateArguments.context,
        activateArguments.awsContext,
        activateArguments.regionProvider
    )

    activateArguments.context.subscriptions.push(
        vscode.window.registerTreeDataProvider(awsExplorer.viewProviderId, awsExplorer)
    )

    await registerAwsExplorerCommands(activateArguments.context, awsExplorer, activateArguments.outputChannel)

    recordVscodeActiveRegions({ value: awsExplorer.getRegionNodesSize() })

    activateArguments.awsContextTrees.addTree(awsExplorer)

    updateAwsExplorerWhenAwsContextCredentialsChange(
        awsExplorer,
        activateArguments.awsContext,
        activateArguments.context
    )
}

async function registerAwsExplorerCommands(
    context: vscode.ExtensionContext,
    awsExplorer: AwsExplorer,
    toolkitOutputChannel: vscode.OutputChannel,
    lambdaOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Lambda')
): Promise<void> {
    context.subscriptions.push(
        vscode.commands.registerCommand('aws.showRegion', async () => {
            try {
                await ext.awsContextCommands.onCommandShowRegion()
            } finally {
                recordAwsShowRegion()
                recordVscodeActiveRegions({ value: awsExplorer.getRegionNodesSize() })
            }
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('aws.hideRegion', async (node?: RegionNode) => {
            try {
                await ext.awsContextCommands.onCommandHideRegion(safeGet(node, x => x.regionCode))
            } finally {
                recordAwsHideRegion()
                recordVscodeActiveRegions({ value: awsExplorer.getRegionNodesSize() })
            }
        })
    )

    let submitFeedbackPanel: vscode.WebviewPanel | undefined
    context.subscriptions.push(
        vscode.commands.registerCommand('aws.submitFeedback', () => {
            if (submitFeedbackPanel) {
                submitFeedbackPanel.reveal(submitFeedbackPanel.viewColumn || vscode.ViewColumn.One)
            } else {
                submitFeedbackPanel = submitFeedback()

                submitFeedbackPanel.onDidDispose(
                    () => {
                        submitFeedbackPanel = undefined
                    },
                    undefined,
                    context.subscriptions
                )
            }
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('aws.refreshAwsExplorer', async () => {
            recordAwsRefreshExplorer()
            awsExplorer.refresh()
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.deleteLambda',
            async (node: LambdaFunctionNode) =>
                await deleteLambda({
                    deleteParams: { functionName: node.configuration.FunctionName || '' },
                    lambdaClient: ext.toolkitClientBuilder.createLambdaClient(node.regionCode),
                    outputChannel: lambdaOutputChannel,
                    onRefresh: () => awsExplorer.refresh(node.parent),
                })
        )
    )

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.deleteCloudFormation',
            async (node: CloudFormationStackNode) =>
                await deleteCloudFormation(() => awsExplorer.refresh(node.parent), node)
        )
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('aws.showErrorDetails', async (node: ErrorNode) => await showErrorDetails(node))
    )

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.invokeLambda',
            async (node: LambdaFunctionNode) =>
                await invokeLambda({
                    functionNode: node,
                    outputChannel: lambdaOutputChannel,
                })
        )
    )

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.downloadStateMachineDefinition',
            async (node: StateMachineNode) =>
                await downloadStateMachineDefinition({
                    stateMachineNode: node,
                    outputChannel: toolkitOutputChannel,
                })
        )
    )

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.executeStateMachine',
            async (node: StateMachineNode) =>
                await executeStateMachine({
                    stateMachineNode: node,
                    outputChannel: toolkitOutputChannel,
                })
        )
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('aws.copyArn', async (node: AWSResourceNode) => await copyArnCommand(node))
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('aws.copyName', async (node: AWSResourceNode) => await copyNameCommand(node))
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('aws.refreshAwsExplorerNode', async (element: AWSTreeNodeBase) => {
            try {
                awsExplorer.refresh(element)
            } finally {
                recordAwsRefreshExplorer()
            }
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('aws.loadMoreChildren', async (node: AWSTreeNodeBase & LoadMoreNode) => {
            await loadMoreChildrenCommand(node, awsExplorer)
        })
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
