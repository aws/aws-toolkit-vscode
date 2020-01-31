/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { cdkDocumentationUrl, cdkProvideFeedbackUrl } from '../shared/constants'
import {
    recordCdkAppExpanded,
    recordCdkExplorerDisabled,
    recordCdkExplorerEnabled,
    recordCdkHelp,
    recordCdkProvideFeedback,
    recordCdkRefreshExplorer
} from '../shared/telemetry/telemetry'
import { AwsCdkExplorer } from './explorer/awsCdkExplorer'
import { AppNode } from './explorer/nodes/appNode'
import { cdk } from './globals'

const EXPLORER_ENABLED_CONFIG_KEY = 'aws.cdk.explorer.enabled'

/**
 * Activate AWS CDK related functionality for the extension.
 */
export async function activate(activateArguments: { extensionContext: vscode.ExtensionContext }): Promise<void> {
    const explorer = new AwsCdkExplorer()

    initializeIconPaths(activateArguments.extensionContext)

    await registerCdkCommands(explorer)
    const view = vscode.window.createTreeView(explorer.viewProviderId, {
        treeDataProvider: explorer,
        showCollapseAll: true
    })
    activateArguments.extensionContext.subscriptions.push(view)

    // Indicates workspace includes a CDK app and user has expanded the Node
    const appNodeExpanded = view.onDidExpandElement(e => {
        if (e.element instanceof AppNode && !e.element.expandMetricRecorded) {
            e.element.expandMetricRecorded = true
            recordCdkAppExpanded()
        }
    })
    activateArguments.extensionContext.subscriptions.push(appNodeExpanded)

    // Indicates CDK explorer view was toggled through configuration setting
    const explorerEnabledToggled = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(EXPLORER_ENABLED_CONFIG_KEY)) {
            if (vscode.workspace.getConfiguration().get(EXPLORER_ENABLED_CONFIG_KEY)) {
                recordCdkExplorerEnabled()
            } else {
                recordCdkExplorerDisabled()
            }
        }
    })
    activateArguments.extensionContext.subscriptions.push(explorerEnabledToggled)
}

function initializeIconPaths(context: vscode.ExtensionContext) {
    cdk.iconPaths.dark.cdk = context.asAbsolutePath('resources/dark/cdk/cdk.svg')
    cdk.iconPaths.light.cdk = context.asAbsolutePath('resources/light/cdk/cdk.svg')

    cdk.iconPaths.dark.cloudFormation = context.asAbsolutePath('resources/dark/cdk/cloudformation.svg')
    cdk.iconPaths.light.cloudFormation = context.asAbsolutePath('resources/light/cdk/cloudformation.svg')
}

async function registerCdkCommands(explorer: AwsCdkExplorer): Promise<void> {
    vscode.commands.registerCommand('aws.cdk.provideFeedback', async () => {
        vscode.env.openExternal(vscode.Uri.parse(cdkProvideFeedbackUrl))
        recordCdkProvideFeedback()
    })
    vscode.commands.registerCommand('aws.cdk.help', async () => {
        vscode.env.openExternal(vscode.Uri.parse(cdkDocumentationUrl))
        recordCdkHelp()
    })
    vscode.commands.registerCommand('aws.refreshCdkExplorer', async () => {
        try {
            explorer.refresh()
        } finally {
            recordCdkRefreshExplorer()
        }
    })
}
