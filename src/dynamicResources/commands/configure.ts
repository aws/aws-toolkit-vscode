/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { memoizedGetResourceTypes } from '../model/resources'
import { fromExtensionManifest } from '../../shared/settings'
import { ArrayConstructor } from '../../shared/utilities/typeConstructors'
import { telemetry } from '../../shared/telemetry/telemetry'

export class ResourcesSettings extends fromExtensionManifest('aws.resources', {
    enabledResources: ArrayConstructor(String),
}) {}

/**
 * Shows a picker menu and stores the selected Resources in user settings.
 *
 * @returns true if the user accepted the picker, false if they canceled it
 */
export async function configureResources(settings = new ResourcesSettings()): Promise<boolean> {
    const window = vscode.window
    const enabledResources = settings.get('enabledResources', [])

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
        await settings.update(
            'enabledResources',
            result.map(res => res.label)
        )
        telemetry.dynamicresource_selectResources.emit()
        return true
    }

    return false
}
