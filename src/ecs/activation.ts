/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { runCommandInContainer } from './commands/runCommandInContainer'
import { EcsContainerNode } from './explorer/ecsContainerNode'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.command.runCommandInContainer', async (node: EcsContainerNode) => {
            await runCommandInContainer(node)
        })
    )
}
