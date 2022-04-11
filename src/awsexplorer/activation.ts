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

import { getLogger } from '../shared/logger'
import { RegionProvider } from '../shared/regions/regionProvider'
import { recordAwsRefreshExplorer, recordAwsShowRegion, recordVscodeActiveRegions } from '../shared/telemetry/telemetry'
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
import { CredentialsStore } from '../credentials/credentialsStore'
import { showViewLogsMessage } from '../shared/utilities/messages'

let didTryAutoConnect = false

import * as nls from 'vscode-nls'
import globals from '../shared/extensionGlobals'
import { ExtContext } from '../shared/extensions'
import { CredentialsSettings } from '../credentials/credentialsUtilities'
const localize = nls.loadMessageBundle()

/**
 * Activates the AWS Explorer UI and related functionality.
 */
export async function activate(args: {
    context: ExtContext
    awsContextTrees: AwsContextTreeCollection
    regionProvider: RegionProvider
    toolkitOutputChannel: vscode.OutputChannel
    remoteInvokeOutputChannel: vscode.OutputChannel
}): Promise<void> {
    const awsExplorer = new AwsExplorer(globals.context, args.context.awsContext, args.regionProvider)

    const view = vscode.window.createTreeView(awsExplorer.viewProviderId, {
        treeDataProvider: awsExplorer,
        showCollapseAll: true,
    })
    globals.context.subscriptions.push(view)

    await registerAwsExplorerCommands(args.context, awsExplorer, args.toolkitOutputChannel)

    globals.context.subscriptions.push(
        view.onDidChangeVisibility(async e => {
            if (e.visible) {
                await tryAutoConnect(args.context.awsContext)
            }
        })
    )

    args.awsContextTrees.addTree(awsExplorer)

    updateAwsExplorerWhenAwsContextCredentialsChange(awsExplorer, args.context.awsContext, globals.context)
}

async function tryAutoConnect(awsContext: AwsContext) {
    try {
        if (!didTryAutoConnect && !(await awsContext.getCredentials())) {
            getLogger().debug('credentials: attempting autoconnect...')
            didTryAutoConnect = true
            const loginManager = new LoginManager(awsContext, new CredentialsStore())
            await loginWithMostRecentCredentials(new CredentialsSettings(), loginManager)
        }
    } catch (err) {
        getLogger().error('credentials: failed to auto-connect: %O', err)
        showViewLogsMessage(localize('AWS.credentials.autoconnect.fatal', 'Exception occurred while connecting'))
    }
}

async function registerAwsExplorerCommands(
    context: ExtContext,
    awsExplorer: AwsExplorer,
    toolkitOutputChannel: vscode.OutputChannel
): Promise<void> {
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.showRegion', async () => {
            try {
                await globals.awsContextCommands.onCommandShowRegion()
            } finally {
                recordAwsShowRegion()
                recordVscodeActiveRegions({ value: awsExplorer.getRegionNodesSize() })
            }
        })
    )

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.submitFeedback', async () => {
            await submitFeedback(context)
        })
    )

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.refreshAwsExplorer', async (passive: boolean = false) => {
            awsExplorer.refresh()

            if (!passive) {
                recordAwsRefreshExplorer()
            }
        })
    )

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.deleteCloudFormation',
            async (node: CloudFormationStackNode) =>
                await deleteCloudFormation(() => awsExplorer.refresh(node.parent), node)
        )
    )

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.downloadStateMachineDefinition',
            async (node: StateMachineNode) =>
                await downloadStateMachineDefinition({
                    stateMachineNode: node,
                    outputChannel: toolkitOutputChannel,
                })
        )
    )

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.executeStateMachine',
            async (node: StateMachineNode) => await executeStateMachine(context, node)
        )
    )

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.renderStateMachineGraph',
            async (node: StateMachineNode) =>
                await downloadStateMachineDefinition({
                    stateMachineNode: node,
                    outputChannel: toolkitOutputChannel,
                    isPreviewAndRender: true,
                })
        )
    )

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.copyArn', async (node: AWSResourceNode) => await copyArnCommand(node))
    )

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.copyName', async (node: AWSResourceNode) => await copyNameCommand(node))
    )

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.refreshAwsExplorerNode', async (element: AWSTreeNodeBase | undefined) => {
            awsExplorer.refresh(element)
        })
    )

    context.extensionContext.subscriptions.push(
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
