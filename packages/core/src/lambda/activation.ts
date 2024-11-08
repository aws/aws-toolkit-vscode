/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { deleteLambda } from './commands/deleteLambda'
import { uploadLambdaCommand } from './commands/uploadLambda'
import { LambdaFunctionNode } from './explorer/lambdaFunctionNode'
import { downloadLambdaCommand } from './commands/downloadLambda'
import { tryRemoveFolder } from '../shared/filesystemUtilities'
import { ExtContext } from '../shared/extensions'
import { invokeRemoteLambda } from './vue/remoteInvoke/invokeLambda'
import { registerSamDebugInvokeVueCommand, registerSamInvokeVueCommand } from './vue/configEditor/samInvokeBackend'
import { Commands } from '../shared/vscode/commands2'
import { DefaultLambdaClient } from '../shared/clients/lambdaClient'
import { copyLambdaUrl } from './commands/copyLambdaUrl'
import { ResourceNode } from '../awsService/appBuilder/explorer/nodes/resourceNode'
import { isTreeNode, TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { getSourceNode } from '../shared/utilities/treeNodeUtils'

/**
 * Activates Lambda components.
 */
export async function activate(context: ExtContext): Promise<void> {
    context.extensionContext.subscriptions.push(
        Commands.register('aws.deleteLambda', async (node: LambdaFunctionNode | TreeNode) => {
            const sourceNode = getSourceNode<LambdaFunctionNode>(node)
            await deleteLambda(sourceNode.configuration, new DefaultLambdaClient(sourceNode.regionCode))
            await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', sourceNode.parent)
        }),
        Commands.register('aws.invokeLambda', async (node: LambdaFunctionNode | TreeNode) => {
            let source: string = 'AwsExplorerRemoteInvoke'
            if (isTreeNode(node)) {
                node = getSourceNode<LambdaFunctionNode>(node)
                source = 'AppBuilderRemoteInvoke'
            }
            await invokeRemoteLambda(context, {
                outputChannel: context.outputChannel,
                functionNode: node,
                source: source,
            })
        }),
        // Capture debug finished events, and delete the temporary directory if it exists
        vscode.debug.onDidTerminateDebugSession(async (session) => {
            if (
                session.configuration?.sam?.buildDir === undefined &&
                session.configuration?.baseBuildDir !== undefined
            ) {
                await tryRemoveFolder(session.configuration.baseBuildDir)
            }
        }),
        Commands.register('aws.downloadLambda', async (node: LambdaFunctionNode | TreeNode) => {
            const sourceNode = getSourceNode<LambdaFunctionNode>(node)
            await downloadLambdaCommand(sourceNode)
        }),
        Commands.register({ id: 'aws.uploadLambda', autoconnect: true }, async (arg?: unknown) => {
            if (arg instanceof LambdaFunctionNode) {
                await uploadLambdaCommand({
                    name: arg.functionName,
                    region: arg.regionCode,
                    configuration: arg.configuration,
                })
            } else if (arg instanceof vscode.Uri) {
                await uploadLambdaCommand(undefined, arg)
            } else {
                await uploadLambdaCommand()
            }
        }),
        Commands.register('aws.copyLambdaUrl', async (node: LambdaFunctionNode | TreeNode) => {
            const sourceNode = getSourceNode<LambdaFunctionNode>(node)
            await copyLambdaUrl(sourceNode, new DefaultLambdaClient(sourceNode.regionCode))
        }),

        registerSamInvokeVueCommand(context),

        Commands.register('aws.launchDebugConfigForm', async (node: ResourceNode) =>
            registerSamDebugInvokeVueCommand(context, { resource: node })
        )
    )
}
