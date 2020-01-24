/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { cdkDocumentationUrl, cdkProvideFeedbackUrl } from '../shared/constants'
import { ext } from '../shared/extensionGlobals'
import { TelemetryEvent } from '../shared/telemetry/telemetryEvent'
import { defaultMetricDatum, registerCommand } from '../shared/telemetry/telemetryUtils'
import { AwsCdkExplorer } from './explorer/awsCdkExplorer'
import { AppNode } from './explorer/nodes/appNode'
import { cdk } from './globals'

const EXPLORER_ENABLED_CONFIG_KEY = 'aws.cdk.explorer.enabled'

/**
 * Telemetry event names for recorded metrics
 */
enum TelemetryEventTypes {
    APP_EXPANDED = 'cdk_appExpanded',
    EXPLORER_RE_ENABLED = 'cdk_explorerEnabled',
    EXPLORER_DISABLED = 'cdk_explorerDisabled'
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
        if (e.element instanceof AppNode && !e.element.expandMetricRecorded) {
            e.element.expandMetricRecorded = true
            ext.telemetry.record(getTelemetryEvent(TelemetryEventTypes.APP_EXPANDED))
        }
    })
    activateArguments.extensionContext.subscriptions.push(appNodeExpanded)

    // Indicates CDK explorer view was toggled through configuration setting
    const explorerEnabledToggled = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(EXPLORER_ENABLED_CONFIG_KEY)) {
            if (vscode.workspace.getConfiguration().get(EXPLORER_ENABLED_CONFIG_KEY)) {
                ext.telemetry.record(getTelemetryEvent(TelemetryEventTypes.EXPLORER_RE_ENABLED))
            } else {
                ext.telemetry.record(getTelemetryEvent(TelemetryEventTypes.EXPLORER_DISABLED))
            }
        }
    })
    activateArguments.extensionContext.subscriptions.push(explorerEnabledToggled)
}

function getTelemetryEvent(eventName: TelemetryEventTypes): TelemetryEvent {
    return {
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
        },
        telemetryName: 'Command_aws.cdk.provideFeedback'
    })
    registerCommand({
        command: 'aws.cdk.help',
        callback: async () => {
            vscode.env.openExternal(vscode.Uri.parse(cdkDocumentationUrl))
        },
        telemetryName: 'Command_aws.cdk.help'
    })
    registerCommand({
        command: 'aws.refreshCdkExplorer',
        callback: async () => explorer.refresh(),
        telemetryName: 'Command_aws.refreshCdkExplorer'
    })
}
