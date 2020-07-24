/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsExplorer } from '../awsexplorer/awsExplorer'
import { ext } from '../shared/extensionGlobals'
import { deleteLambda } from './commands/deleteLambda'
import { invokeLambda } from './commands/invokeLambda'
import { LambdaFunctionNode } from './explorer/lambdaFunctionNode'

/**
 * Activates Lambda components.
 */
export async function activate(extensionContext: vscode.ExtensionContext, awsExplorer: AwsExplorer): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('AWS Lambda')

    extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.deleteLambda',
            async (node: LambdaFunctionNode) =>
                await deleteLambda({
                    deleteParams: { functionName: node.configuration.FunctionName || '' },
                    lambdaClient: ext.toolkitClientBuilder.createLambdaClient(node.regionCode),
                    outputChannel,
                    onRefresh: () => awsExplorer.refresh(node.parent),
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
}
