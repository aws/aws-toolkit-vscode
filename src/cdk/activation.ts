/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { AslVisualizationCDKManager } from '../stepFunctions/commands/visualizeStateMachine/aslVisualizationCDKManager'
import { AwsCdkExplorer } from './explorer/awsCdkExplorer'
import { AppNode } from './explorer/nodes/appNode'
import { ConstructNode } from './explorer/nodes/constructNode'
import { cdk } from './globals'
import { cdkDocumentationUrl } from '../shared/constants'
import { initalizeWebviewPaths } from '../stepFunctions/activation'
import { recordCdkAppExpanded, recordCdkHelp, recordCdkRefreshExplorer } from '../shared/telemetry/telemetry'
import { renderStateMachineGraphCommand } from '../stepFunctions/commands/visualizeStateMachine/renderStateMachineGraphCDK'

/**
 * Activate AWS CDK related functionality for the extension.
 */
export async function activate(activateArguments: { extensionContext: vscode.ExtensionContext }): Promise<void> {
    const explorer = new AwsCdkExplorer()

    initializeIconPaths(activateArguments.extensionContext)
    initalizeWebviewPaths(activateArguments.extensionContext)

    await registerCdkCommands(activateArguments.extensionContext, explorer)
    const view = vscode.window.createTreeView(explorer.viewProviderId, {
        treeDataProvider: explorer,
        showCollapseAll: true,
    })
    activateArguments.extensionContext.subscriptions.push(view)

    activateArguments.extensionContext.subscriptions.push(
        view.onDidChangeVisibility(e => {
            explorer.visible = e.visible
            if (e.visible) {
                explorer.refresh()
            }
        })
    )
    // Indicates workspace includes a CDK app and user has expanded the Node
    activateArguments.extensionContext.subscriptions.push(
        view.onDidExpandElement(e => {
            if (e.element instanceof AppNode && !e.element.expandMetricRecorded) {
                e.element.expandMetricRecorded = true
                recordCdkAppExpanded()
            }
        })
    )
}

function initializeIconPaths(context: vscode.ExtensionContext) {
    cdk.iconPaths.dark.cdk = context.asAbsolutePath('resources/dark/cdk/cdk.svg')
    cdk.iconPaths.light.cdk = context.asAbsolutePath('resources/light/cdk/cdk.svg')

    cdk.iconPaths.dark.cloudFormation = context.asAbsolutePath('resources/dark/cdk/cloudformation.svg')
    cdk.iconPaths.light.cloudFormation = context.asAbsolutePath('resources/light/cdk/cloudformation.svg')
}

async function registerCdkCommands(context: vscode.ExtensionContext, explorer: AwsCdkExplorer): Promise<void> {
    context.subscriptions.push(
        vscode.commands.registerCommand('aws.cdk.help', async () => {
            vscode.env.openExternal(vscode.Uri.parse(cdkDocumentationUrl))
            recordCdkHelp()
        })
    )
    context.subscriptions.push(
        vscode.commands.registerCommand('aws.refreshCdkExplorer', async () => {
            try {
                explorer.refresh()
            } finally {
                recordCdkRefreshExplorer()
            }
        })
    )

    const visualizationManager = new AslVisualizationCDKManager(context)
    context.subscriptions.push(
        vscode.commands.registerCommand('aws.cdk.renderStateMachineGraph', async (node: ConstructNode) => {
            await renderStateMachineGraphCommand(context.globalState, visualizationManager, node)
        })
    )
}
