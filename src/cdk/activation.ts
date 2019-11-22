/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { cdkDocumentationUrl, cdkProvideFeedbackUrl } from '../shared/constants'
import { ext } from '../shared/extensionGlobals'
import { TelemetryEvent } from '../shared/telemetry/telemetryEvent'
import { TelemetryNamespace } from '../shared/telemetry/telemetryTypes'
import { defaultMetricDatum, registerCommand } from '../shared/telemetry/telemetryUtils'
import { AwsCdkExplorer } from './explorer/awsCdkExplorer'
import { cdk } from './globals'

const EXPLORER_ENABLED_CONFIG_KEY = 'aws.cdk.explorer.enabled'
const APP_NODE_CONTEXT_KEY = 'awsCdkAppNode'

/**
 * Telemetry event names for recorded metrics
 */
enum TelemetryEventTypes {
    APP_EXPANDED = 'appExpanded',
    EXPLORER_RE_ENABLED = 'explorerEnabled',
    EXPLORER_DISABLED = 'explorerDisabled'
}

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
        if (e.element.contextValue === APP_NODE_CONTEXT_KEY) {
            ext.telemetry.record(getTelemetryEvent(TelemetryEventTypes.APP_EXPANDED))
        }
    })
    activateArguments.extensionContext.subscriptions.push(appNodeExpanded)

    // Indicates CDK explorer was disabled
    const explorerDisabled = vscode.workspace.onDidChangeConfiguration(e => {
        if (
            e.affectsConfiguration(EXPLORER_ENABLED_CONFIG_KEY) &&
            !vscode.workspace.getConfiguration().get(EXPLORER_ENABLED_CONFIG_KEY)
        ) {
            ext.telemetry.record(getTelemetryEvent(TelemetryEventTypes.EXPLORER_DISABLED))
        }
    })
    activateArguments.extensionContext.subscriptions.push(explorerDisabled)

    const explorerReEnabled = vscode.workspace.onDidChangeConfiguration(e => {
        if (
            e.affectsConfiguration(EXPLORER_ENABLED_CONFIG_KEY) &&
            vscode.workspace.getConfiguration().get(EXPLORER_ENABLED_CONFIG_KEY)
        ) {
            ext.telemetry.record(getTelemetryEvent(TelemetryEventTypes.EXPLORER_RE_ENABLED))
        }
    })
    activateArguments.extensionContext.subscriptions.push(explorerReEnabled)
}

function getTelemetryEvent(eventName: TelemetryEventTypes): TelemetryEvent {
    return {
        namespace: TelemetryNamespace.Cdk,
        createTime: new Date(),
        data: [defaultMetricDatum(eventName)]
    }
}

function initializeIconPaths(context: vscode.ExtensionContext) {
    cdk.iconPaths.dark.cdk = context.asAbsolutePath('resources/dark/cdk/cdk.svg')
    cdk.iconPaths.light.cdk = context.asAbsolutePath('resources/light/cdk/cdk.svg')

    cdk.iconPaths.dark.cloudFormation = context.asAbsolutePath('resources/dark/cdk/cloudformation.svg')
    cdk.iconPaths.light.cloudFormation = context.asAbsolutePath('resources/light/cdk/cloudformation.svg')
}

async function registerCdkCommands(explorer: AwsCdkExplorer): Promise<void> {
    registerCommand({
        command: 'aws.cdk.provideFeedback',
        callback: async () => {
            vscode.env.openExternal(vscode.Uri.parse(cdkProvideFeedbackUrl))
        }
    })
    registerCommand({
        command: 'aws.cdk.help',
        callback: async () => {
            vscode.env.openExternal(vscode.Uri.parse(cdkDocumentationUrl))
        }
    })
    registerCommand({
        command: 'aws.refreshCdkExplorer',
        callback: async () => explorer.refresh()
    })
}
