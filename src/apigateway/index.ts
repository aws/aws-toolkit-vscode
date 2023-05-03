/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RestApiNode } from './explorer/apiNodes'
import { invokeRemoteRestApi } from './vue/invokeRemoteRestApi'
import { copyUrlCommand } from './commands/copyUrl'
import type { extcontext } from '../modules.gen'
import { Commands } from '../shared/vscode/commands2'

/**
 * Activate API Gateway functionality for the extension.
 */
export async function activate(_: vscode.ExtensionContext, ctx: extcontext): Promise<void> {
    const extensionContext = ctx.extensionContext
    const regionProvider = ctx.regionProvider
    extensionContext.subscriptions.push(
        Commands.register('aws.apig.copyUrl', async (node: RestApiNode) => await copyUrlCommand(node, regionProvider)),
        Commands.register(
            'aws.apig.invokeRemoteRestApi',
            async (node: RestApiNode) =>
                await invokeRemoteRestApi(ctx, {
                    apiNode: node,
                    outputChannel: ctx.outputChannel,
                })
        )
    )
}
