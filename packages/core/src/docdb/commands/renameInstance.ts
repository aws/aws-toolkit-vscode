/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { validateInstanceName } from '../utils'
import { DBInstanceNode } from '../explorer/dbInstanceNode'

/**
 * Renames a DocumentDB instance.
 *
 * Prompts the user for the new instance name
 * Updates the instance.
 * Refreshes the node.
 */
export async function renameInstance(node: DBInstanceNode) {
    getLogger().debug('RenameInstance called for: %O', node)

    if (!node) {
        throw new Error('No node specified for RenameInstance')
    }

    const instanceName = node.instance.DBInstanceIdentifier

    if (node.instance.DBInstanceStatus !== 'available') {
        void vscode.window.showErrorMessage(
            localize('AWS.docdb.deleteInstance.instanceStopped', 'Instance must be running')
        )
        return
    }

    const newInstanceName = await vscode.window.showInputBox({
        prompt: localize('AWS.docdb.renameInstance.prompt', 'New instance name'),
        value: instanceName,
        validateInput: validateInstanceName,
    })

    if (!newInstanceName) {
        getLogger().info('RenameInstance cancelled')
        return
    }

    try {
        const instance = await node.renameInstance(newInstanceName)

        getLogger().info('Renamed instance: %O', instance)
        void vscode.window.showInformationMessage(
            localize('AWS.docdb.renameInstance.success', 'Updated instance: {0}', instanceName)
        )

        node.refresh()
        return instance
    } catch (e) {
        getLogger().error(`Failed to rename instance ${instanceName}: %s`, e)
        void showViewLogsMessage(
            localize('AWS.docdb.renameInstance.error', 'Failed to rename instance: {0}', instanceName)
        )
    }
}
