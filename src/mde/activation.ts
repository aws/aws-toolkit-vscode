/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { mdeConnectCommand, mdeCreateCommand } from './mdeCommands'
import { MdeInstanceNode } from './mdeInstanceNode'
import { MdeRootNode } from './mdeRootNode'
// import * as mde from '../shared/clients/mdeClient'

/**
 * Activates MDE functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    await registerCommands(ctx)
}

async function registerCommands(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.mde.connect', async (treenode: MdeInstanceNode) => {
            mdeConnectCommand(treenode.env)
        })
    )
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.mde.create', async (treenode: MdeRootNode) => {
            mdeCreateCommand(treenode)
        })
    )
}
