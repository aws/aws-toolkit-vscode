/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { recordDynamicresourceSelectResources } from '../../shared/telemetry/telemetry'
import { memoizedGetResourceTypes } from '../model/resources'

export async function configureResources(): Promise<boolean> {
    const window = vscode.window
    const configuration = vscode.workspace.getConfiguration('aws').get<string[]>('resources.enabledResources')

    const quickPickItems: vscode.QuickPickItem[] = []
    const resourceTypes = memoizedGetResourceTypes().keys()
    for (const type of resourceTypes) {
        quickPickItems.push({
            label: type,
            picked: configuration ? configuration.includes(type) : false,
        })
    }

    const result = await window.showQuickPick(quickPickItems, {
        placeHolder: localize('aws.resources.resourcesToInclude', 'Select resources to include'),
        canPickMany: true,
    })

    if (result) {
        const enabledResources = result?.map(res => res.label)
        await vscode.workspace
            .getConfiguration()
            .update('aws.resources.enabledResources', enabledResources, vscode.ConfigurationTarget.Global)
        recordDynamicresourceSelectResources()
        return true
    }

    return false
}
