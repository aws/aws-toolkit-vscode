/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { updateEnableExecuteCommandFlag } from './commands/updateEnableExecuteCommandFlag'
import { runCommandInContainer } from './commands/runCommandInContainer'
import { EcsContainerNode } from './explorer/ecsContainerNode'
import { EcsServiceNode } from './explorer/ecsServiceNode'
import { ecsDocumentationUrl } from '../shared/constants'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.ecs.runCommandInContainer', async (node: EcsContainerNode) => {
            await runCommandInContainer(node)
        })
    )

    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.ecs.enableEcsExec', async (node: EcsServiceNode) => {
            await updateEnableExecuteCommandFlag(node, true)
        })
    )

    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.ecs.disableEcsExec', async (node: EcsServiceNode) => {
            await updateEnableExecuteCommandFlag(node, false)
        })
    )

    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.ecs.viewDocumentation', async () => {
            vscode.env.openExternal(vscode.Uri.parse(ecsDocumentationUrl))
        })
    )
}
