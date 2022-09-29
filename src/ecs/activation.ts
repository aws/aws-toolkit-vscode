/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { updateEnableExecuteCommandFlag } from './commands/updateEnableExecuteCommandFlag'
import { runCommandInContainer } from './commands/runCommandInContainer'
import { EcsContainerNode } from './explorer/ecsContainerNode'
import { EcsServiceNode } from './explorer/ecsServiceNode'
import { ecsDocumentationUrl } from '../shared/constants'
import { getLogger } from '../shared/logger'
import { Commands } from '../shared/vscode/commands2'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ecs.runCommandInContainer', async (node: EcsContainerNode) => {
            // VS Code will rarely call the command with `undefined` if the tree is still loading
            if (!(node instanceof EcsContainerNode)) {
                getLogger().error('Cannot run command on node: %O', node)
                vscode.window.showErrorMessage(
                    localize(
                        'AWS.explorerNode.notLoaded',
                        'This resource may not be fully loaded yet. Please try again.'
                    )
                )
                return
            }
            await runCommandInContainer(node)
        })
    )

    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ecs.enableEcsExec', async (node: EcsServiceNode) => {
            await updateEnableExecuteCommandFlag(node, true)
        })
    )

    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ecs.disableEcsExec', async (node: EcsServiceNode) => {
            await updateEnableExecuteCommandFlag(node, false)
        })
    )

    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ecs.viewDocumentation', async () => {
            vscode.env.openExternal(vscode.Uri.parse(ecsDocumentationUrl))
        })
    )
}
