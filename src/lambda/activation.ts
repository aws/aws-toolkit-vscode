/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { deleteLambda } from './commands/deleteLambda'
import { invokeLambda } from './commands/invokeLambda'
import { uploadLambdaCommand } from './commands/uploadLambda'
import { LambdaFunctionNode } from './explorer/lambdaFunctionNode'
import { downloadLambdaCommand } from './commands/downloadLambda'
import { tryRemoveFolder } from '../shared/filesystemUtilities'
import { registerSamInvokeVueCommand } from './vue/samInvokeBackend'
import { ExtContext } from '../shared/extensions'
import globals from '../shared/extensionGlobals'

/**
 * Activates Lambda components.
 */
export async function activate(context: ExtContext): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('AWS Lambda')

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.deleteLambda',
            async (node: LambdaFunctionNode) =>
                await deleteLambda({
                    deleteParams: { functionName: node.configuration.FunctionName || '' },
                    lambdaClient: globals.toolkitClientBuilder.createLambdaClient(node.regionCode),
                    outputChannel,
                    onRefresh: async () =>
                        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node.parent),
                })
        ),
        vscode.commands.registerCommand(
            'aws.invokeLambda',
            async (node: LambdaFunctionNode) =>
                await invokeLambda({
                    functionNode: node,
                    outputChannel,
                })
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
        vscode.commands.registerCommand('aws.uploadLambda', async (node: LambdaFunctionNode) => {
            await uploadLambdaCommand(node)
        }),
        registerSamInvokeVueCommand(context)
    )
}
