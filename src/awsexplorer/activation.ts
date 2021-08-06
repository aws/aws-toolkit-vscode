/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { loginWithMostRecentCredentials } from '../credentials/activation'
import { LoginManager } from '../credentials/loginManager'
import { submitFeedback } from '../feedback/commands/submitFeedback'
import { deleteCloudFormation } from '../lambda/commands/deleteCloudFormation'
import { CloudFormationStackNode } from '../lambda/explorer/cloudFormationNodes'
import { AwsContext } from '../shared/awsContext'
import { AwsContextTreeCollection } from '../shared/awsContextTreeCollection'
import { ext } from '../shared/extensionGlobals'
import { safeGet } from '../shared/extensionUtilities'
import { getLogger } from '../shared/logger'
import { RegionProvider } from '../shared/regions/regionProvider'
import { DefaultSettingsConfiguration } from '../shared/settingsConfiguration'
import {
    recordAwsHideRegion,
    recordAwsRefreshExplorer,
    recordAwsShowRegion,
    recordVscodeActiveRegions,
} from '../shared/telemetry/telemetry'
import { AWSResourceNode } from '../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../shared/treeview/nodes/loadMoreNode'
import { downloadStateMachineDefinition } from '../stepFunctions/commands/downloadStateMachineDefinition'
import { executeStateMachine } from '../stepFunctions/commands/executeStateMachine'
import { StateMachineNode } from '../stepFunctions/explorer/stepFunctionsNodes'
import { AwsExplorer } from './awsExplorer'
import { copyArnCommand } from './commands/copyArn'
import { copyNameCommand } from './commands/copyName'
import { loadMoreChildrenCommand } from './commands/loadMoreChildren'
import { checkExplorerForDefaultRegion } from './defaultRegion'
import { RegionNode } from './regionNode'
import { extensionSettingsPrefix } from '../shared/constants'
import { CredentialsStore } from '../credentials/credentialsStore'

let didTryAutoConnect = false

/**
 * Activates the AWS Explorer UI and related functionality.
 */
export async function activate(args: {
    awsContext: AwsContext
    awsContextTrees: AwsContextTreeCollection
    regionProvider: RegionProvider
    toolkitOutputChannel: vscode.OutputChannel
    remoteInvokeOutputChannel: vscode.OutputChannel
}): Promise<void> {
    const awsExplorer = new AwsExplorer(ext.context, args.awsContext, args.regionProvider)

    const view = vscode.window.createTreeView(awsExplorer.viewProviderId, {
        treeDataProvider: awsExplorer,
        showCollapseAll: true,
    })
    ext.context.subscriptions.push(view)

    await registerAwsExplorerCommands(ext.context, awsExplorer, args.toolkitOutputChannel)

    ext.context.subscriptions.push(
        view.onDidChangeVisibility(async e => {
            if (!didTryAutoConnect && e.visible && !(await args.awsContext.getCredentials())) {
                didTryAutoConnect = true
                const toolkitSettings = new DefaultSettingsConfiguration(extensionSettingsPrefix)
                const loginManager = new LoginManager(args.awsContext, new CredentialsStore())
                await loginWithMostRecentCredentials(toolkitSettings, loginManager)
            }
        })
    )

    recordVscodeActiveRegions({ value: awsExplorer.getRegionNodesSize() })

    args.awsContextTrees.addTree(awsExplorer)

    updateAwsExplorerWhenAwsContextCredentialsChange(awsExplorer, args.awsContext, ext.context)
}

async function registerAwsExplorerCommands(
    context: vscode.ExtensionContext,
    awsExplorer: AwsExplorer,
    toolkitOutputChannel: vscode.OutputChannel
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
        vscode.commands.registerCommand('aws.refreshAwsExplorer', async (passive: boolean = false) => {
            awsExplorer.refresh()

            if (!passive) {
                recordAwsRefreshExplorer()
            }
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.deleteCloudFormation',
            async (node: CloudFormationStackNode) =>
                await deleteCloudFormation(() => awsExplorer.refresh(node.parent), node)
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
        vscode.commands.registerCommand('aws.refreshAwsExplorerNode', async (element: AWSTreeNodeBase | undefined) => {
            awsExplorer.refresh(element)
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
