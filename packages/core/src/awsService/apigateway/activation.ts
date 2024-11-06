/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RestApiNode } from './explorer/apiNodes'
import { invokeRemoteRestApi } from './vue/invokeRemoteRestApi'
import { copyUrlCommand } from './commands/copyUrl'
import { ExtContext } from '../../shared/extensions'
import { Commands } from '../../shared/vscode/commands2'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { getSourceNode } from '../../shared/utilities/treeNodeUtils'

/**
 * Activate API Gateway functionality for the extension.
 */
export async function activate(activateArguments: {
    extContext: ExtContext
    outputChannel: vscode.OutputChannel
}): Promise<void> {
    const extensionContext = activateArguments.extContext.extensionContext
    const regionProvider = activateArguments.extContext.regionProvider
    extensionContext.subscriptions.push(
        Commands.register('aws.apig.copyUrl', async (node: RestApiNode | TreeNode) => {
            const sourceNode = getSourceNode<RestApiNode>(node)
            await copyUrlCommand(sourceNode, regionProvider)
        }),
        Commands.register('aws.apig.invokeRemoteRestApi', async (node: RestApiNode | TreeNode) => {
            const sourceNode = getSourceNode<RestApiNode>(node)
            await invokeRemoteRestApi(activateArguments.extContext, {
                apiNode: sourceNode,
                outputChannel: activateArguments.outputChannel,
            })
        })
    )
}
