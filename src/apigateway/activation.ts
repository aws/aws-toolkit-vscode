/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RestApiNode } from './explorer/apiNodes'
import { invokeRemoteRestApi } from './commands/invokeRemoteRestApi'

/**
 * Activate API Gateway functionality for the extension.
 */
export async function activateApiGateway(activateArguments: {
    context: vscode.ExtensionContext
    outputChannel: vscode.OutputChannel
}): Promise<void> {
    activateArguments.context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.apig.invokeRemoteRestApi',
            async (node: RestApiNode) =>
                await invokeRemoteRestApi({
                    apiNode: node,
                    outputChannel: activateArguments.outputChannel,
                })
        )
    )
}
