/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { DBInstanceNode } from '../explorer/dbInstanceNode'

/**
 * Reboots a DocumentDB instance.
 * Refreshes the parent node.
 */
export async function rebootInstance(node: DBInstanceNode) {
    getLogger().debug('RebootInstance called for: %O', node)

    if (!node) {
        throw new Error('No node specified')
    }

    if (node.instance.DBInstanceStatus !== 'available') {
        void vscode.window.showErrorMessage(
            localize('AWS.docdb.deleteInstance.instanceStopped', 'Instance must be running')
        )
        return
    }

    const instanceName = node.instance.DBInstanceIdentifier
    try {
        const instance = await node.rebootInstance()

        getLogger().info('Rebooting instance: %O', instance)
        void vscode.window.showInformationMessage(
            localize('AWS.docdb.rebootInstance.success', 'Rebooting instance: {0}', instanceName)
        )

        node.parent.refresh()
        return instance
    } catch (e) {
        getLogger().error(`Failed to reboot instance ${instanceName}: %s`, e)
        void showViewLogsMessage(
            localize('AWS.docdb.rebootInstance.error', 'Failed to reboot instance: {0}', instanceName)
        )
    }
}
