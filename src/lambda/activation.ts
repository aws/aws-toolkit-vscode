/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { deleteLambda } from './commands/deleteLambda'
import { invokeRemoteLambda } from './commands/invokeLambda'
import { uploadLambdaCommand } from './commands/uploadLambda'
import { LambdaFunctionNode } from './explorer/lambdaFunctionNode'
import { downloadLambdaCommand } from './commands/downloadLambda'
import { tryRemoveFolder } from '../shared/filesystemUtilities'
import { ExtContext } from '../shared/extensions'
import globals from '../shared/extensionGlobals'
import { registerSamInvokeVueCommand } from './configEditor/vue/samInvokeBackend'

/**
 * Activates Lambda components.
 */
export async function activate(context: ExtContext): Promise<void> {
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.deleteLambda',
            async (node: LambdaFunctionNode) =>
                await deleteLambda({
                    deleteParams: { functionName: node.configuration.FunctionName || '' },
                    lambdaClient: globals.toolkitClientBuilder.createLambdaClient(node.regionCode),
                    outputChannel: context.outputChannel,
                    onRefresh: async () =>
                        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node.parent),
                })
        ),
        vscode.commands.registerCommand(
            'aws.invokeLambda',
            async (node: LambdaFunctionNode) =>
                await invokeRemoteLambda(context, { outputChannel: context.outputChannel, functionNode: node })
        ),
        // Capture debug finished events, and delete the temporary directory if it exists
        vscode.debug.onDidTerminateDebugSession(async session => {
            if (
                session.configuration?.sam?.buildDir === undefined &&
                session.configuration?.baseBuildDir !== undefined
            ) {
                await tryRemoveFolder(session.configuration.baseBuildDir)
            }
        }),
        vscode.commands.registerCommand(
            'aws.downloadLambda',
            async (node: LambdaFunctionNode) => await downloadLambdaCommand(node)
        ),
        vscode.commands.registerCommand('aws.uploadLambda', async arg => {
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
        registerSamInvokeVueCommand(context)
    )
}
