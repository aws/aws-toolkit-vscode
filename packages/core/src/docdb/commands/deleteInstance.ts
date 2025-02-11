/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { DBInstanceNode } from '../explorer/dbInstanceNode'
import { DBClusterNode } from '../explorer/dbClusterNode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { assertNodeAvailable } from '../utils'

/**
 * Deletes a DocumentDB instance.
 *
 * Prompts the user for confirmation.
 * Deletes the instance.
 * Refreshes the parent cluster node.
 */
export async function deleteInstance(node: DBInstanceNode) {
    getLogger().debug('docdb: DeleteInstance called for: %O', node)

    await telemetry.docdb_deleteInstance.run(async () => {
        assertNodeAvailable(node, 'DeleteInstance')
        const parent = node.parent as DBClusterNode
        const client = parent.client
        const instanceName = node.instance.DBInstanceIdentifier ?? ''

        if (!parent?.isAvailable) {
            void vscode.window.showErrorMessage(
                localize('AWS.docdb.deleteInstance.clusterStopped', 'Cluster must be started to delete instances')
            )
            throw new ToolkitError('Cluster not running', { cancelled: true })
        }

        const isConfirmed = await showConfirmationDialog(instanceName)
        if (!isConfirmed) {
            getLogger().debug('docdb: DeleteInstance cancelled')
            throw new ToolkitError('User cancelled deleteInstance', { cancelled: true })
        }

        try {
            getLogger().info(`docdb: Deleting instance: ${instanceName}`)

            const instance = await client.deleteInstance({
                DBInstanceIdentifier: instanceName,
            })

            getLogger().info('docdb: Deleted instance: %O', instance)
            void vscode.window.showInformationMessage(
                localize('AWS.docdb.deleteInstance.success', 'Deleting instance: {0}', instanceName)
            )

            parent.refresh()
            return instance
        } catch (e) {
            getLogger().error(`docdb: Failed to delete instance ${instanceName}: %s`, e)
            void showViewLogsMessage(
                localize('AWS.docdb.deleteInstance.error', 'Failed to delete instance: {0}', instanceName)
            )
            throw ToolkitError.chain(e, `Failed to delete instance ${instanceName}`)
        }
    })
}

async function showConfirmationDialog(instanceName: string): Promise<boolean> {
    const prompt = localize('AWS.docdb.deleteInstance.prompt', 'Enter {0} to confirm deletion', instanceName)
    const confirmationInput = await vscode.window.showInputBox({
        prompt,
        placeHolder: instanceName,
        validateInput: (input) => (input !== instanceName ? prompt : undefined),
    })

    return confirmationInput === instanceName
}
