/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from '../shared/extensionGlobals'
import { ActiveFeatureKeys, FeatureToggle } from '../shared/featureToggle'
import { deleteLambda } from './commands/deleteLambda'
import { invokeLambda } from './commands/invokeLambda'
import { uploadLambdaCommand } from './commands/uploadLambda'
import { LambdaFunctionNode } from './explorer/lambdaFunctionNode'
import { importLambdaCommand } from './commands/importLambda'

/**
 * Activates Lambda components.
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('AWS Lambda')

    extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.deleteLambda',
            async (node: LambdaFunctionNode) =>
                await deleteLambda({
                    deleteParams: { functionName: node.configuration.FunctionName || '' },
                    lambdaClient: ext.toolkitClientBuilder.createLambdaClient(node.regionCode),
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
        )
    )

    if (FeatureToggle.getFeatureToggle().isFeatureActive(ActiveFeatureKeys.LambdaImport)) {
        vscode.commands.executeCommand('setContext', 'aws-toolkit-vscode:LambdaImport', true)

        extensionContext.subscriptions.push(
            vscode.commands.registerCommand(
                'aws.importLambda',
                async (node: LambdaFunctionNode) => await importLambdaCommand(node)
            )
        )
    }

    if (FeatureToggle.getFeatureToggle().isFeatureActive(ActiveFeatureKeys.LambdaUpload)) {
        vscode.commands.executeCommand('setContext', 'aws-toolkit-vscode:LambdaUpload', true)

        extensionContext.subscriptions.push(
            vscode.commands.registerCommand('aws.uploadLambda', async (node: LambdaFunctionNode) => {
                await uploadLambdaCommand(node)
            })
        )
    }
}
