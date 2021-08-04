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

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.command.runCommandInContainer', async (node: EcsContainerNode) => {
            await runCommandInContainer(node)
        })
    )

    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.command.enableEcsExec', async (node: EcsServiceNode) => {
            await updateEnableExecuteCommandFlag(node, true)
        })
    )

    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.command.disableEcsExec', async (node: EcsServiceNode) => {
            await updateEnableExecuteCommandFlag(node, false)
        })
    )
}
