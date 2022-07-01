/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { deleteLambda } from './commands/deleteLambda'
import { uploadLambdaCommand } from './commands/uploadLambda'
import { LambdaFunctionNode } from './explorer/lambdaFunctionNode'
import { downloadLambdaCommand } from './commands/downloadLambda'
import { tryRemoveFolder } from '../shared/filesystemUtilities'
import { ExtContext } from '../shared/extensions'
import globals from '../shared/extensionGlobals'
import { invokeRemoteLambda } from './vue/remoteInvoke/invokeLambda'
import { registerSamInvokeVueCommand } from './vue/configEditor/samInvokeBackend'
import { Commands } from '../shared/vscode/commands2'

/**
 * Activates Lambda components.
 */
export async function activate(context: ExtContext): Promise<void> {
    context.extensionContext.subscriptions.push(
        Commands.register(
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
        Commands.register(
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
        Commands.register('aws.downloadLambda', async (node: LambdaFunctionNode) => await downloadLambdaCommand(node)),
        Commands.register({ id: 'aws.uploadLambda', autoconnect: true }, async (arg?: unknown) => {
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
