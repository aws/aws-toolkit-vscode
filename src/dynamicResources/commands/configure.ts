/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { recordDynamicresourceSelectResources } from '../../shared/telemetry/telemetry'
import { memoizedGetResourceTypes } from '../model/resources'
import { fromPackage } from '../../shared/settingsConfiguration'
import { ArrayConstructor } from '../../shared/utilities/typeConstructors'

export class ResourcesConfiguration extends fromPackage('aws.resources', {
    enabledResources: ArrayConstructor(String),
}) {}

export async function configureResources(config = new ResourcesConfiguration()): Promise<boolean> {
    const window = vscode.window
    const enabledResources = config.get('enabledResources', [])

    const quickPickItems: vscode.QuickPickItem[] = []
    const resourceTypes = memoizedGetResourceTypes().keys()
    for (const type of resourceTypes) {
        quickPickItems.push({
            label: type,
            picked: enabledResources.includes(type),
        })
    }

    const result = await window.showQuickPick(quickPickItems, {
        placeHolder: localize('aws.resources.resourcesToInclude', 'Select resources to include'),
        canPickMany: true,
    })

    if (result) {
        await config.update(
            'enabledResources',
            result.map(res => res.label)
        )
        recordDynamicresourceSelectResources()
        return true
    }

    return false
}
