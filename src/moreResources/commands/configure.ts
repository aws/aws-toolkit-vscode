/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import * as supportedResources from '../model/supported_resources.json'
import { recordDynamicresourceSelectResources } from '../../shared/telemetry/telemetry'
import { ResourceMetadata } from '../explorer/nodes/moreResourcesNode'
const types = Object.keys(supportedResources)

export async function configureResources(): Promise<boolean> {
    const window = vscode.window
    const configuration = vscode.workspace.getConfiguration('aws').get<string[]>('moreResources.enabledResources')

    const quickPickItems: vscode.QuickPickItem[] = []
    for (const typeName of types) {
        const resource = supportedResources[typeName as keyof typeof supportedResources] as ResourceMetadata
        if (resource.operations.includes('LIST')) {
            quickPickItems.push({
                label: typeName,
                picked: configuration ? configuration.includes(typeName) : false,
            })
        }
    }

    const result = await window.showQuickPick(quickPickItems, {
        placeHolder: localize('aws.moreResources.resourcesToInclude', 'Select resources to include'),
        canPickMany: true,
    })

    if (result) {
        const enabledResources = result?.map(res => res.label)
        await vscode.workspace
            .getConfiguration()
            .update('aws.moreResources.enabledResources', enabledResources, vscode.ConfigurationTarget.Global)
        recordDynamicresourceSelectResources()
        return true
    }

    return false
}
