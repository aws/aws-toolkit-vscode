/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { DBClusterNode } from '../explorer/dbClusterNode'
import { showQuickPick } from '../../shared/ui/pickerPrompter'
import { formatDate, formatTime } from '../../shared/date'
import { telemetry } from '../../shared/telemetry/telemetry'
import { DBElasticClusterNode } from '../explorer/dbElasticClusterNode'
import { assertNodeAvailable } from '../utils'

/**
 * Deletes a DocumentDB cluster.
 *
 * Prompts the user for confirmation, and whether to keep a snapshot
 * Deletes the cluster and all instances.
 * Refreshes the cluster node.
 */
export async function deleteCluster(node: DBClusterNode | DBElasticClusterNode) {
    getLogger().debug('docdb: DeleteCluster called for: %O', node)

    await telemetry.docdb_deleteCluster.run(async (span) => {
        assertNodeAvailable(node, 'DeleteCluster')
        const clusterName = node.name
        const isRegionalCluster = node instanceof DBClusterNode

        if (isRegionalCluster && node.cluster.DeletionProtection) {
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.docdb.deleteCluster.protected',
                    'Clusters cannot be deleted while deletion protection is enabled'
                )
            )
            throw new ToolkitError('Deletion protection is active', {
                cancelled: true,
                code: 'docdbDeletionProtectionInUse',
            })
        }

        const takeSnapshot = await showQuickPick(
            [
                { label: localize('AWS.generic.response.yes', 'Yes'), data: true },
                { label: localize('AWS.generic.response.no', 'No'), data: false },
            ],
            {
                title: localize(
                    'AWS.docdb.deleteCluster.promptSnapshot',
                    'Delete Cluster - Keep a snapshot of the data?'
                ),
            }
        )

        if (takeSnapshot === undefined) {
            getLogger().debug('docdb: DeleteCluster cancelled')
            throw new ToolkitError('User cancelled deleteCluster wizard', { cancelled: true })
        }

        const isConfirmed = await showConfirmationDialog()
        if (!isConfirmed) {
            getLogger().debug('docdb: DeleteCluster cancelled')
            throw new ToolkitError('User cancelled deleteCluster wizard', { cancelled: true })
        }

        try {
            getLogger().debug(`docdb: Deleting cluster: ${clusterName}`)

            let finalSnapshotId: string | undefined = undefined
            if (takeSnapshot) {
                finalSnapshotId = `${clusterName}-${formatDate()}-${formatTime()}`
            }

            const cluster = await node.deleteCluster(finalSnapshotId)

            void vscode.window.showInformationMessage(
                localize('AWS.docdb.deleteCluster.success', 'Deleting cluster: {0}', clusterName)
            )

            await node.waitUntilStatusChanged()
            node.parent.refresh()
            getLogger().info('docdb: Deleted cluster: %O', cluster)
            return cluster
        } catch (e) {
            getLogger().error(`docdb: Failed to delete cluster ${clusterName}: %s`, e)
            void showViewLogsMessage(
                localize('AWS.docdb.deleteCluster.error', 'Failed to delete cluster: {0}', clusterName)
            )
            throw ToolkitError.chain(e, `Failed to delete cluster ${clusterName}`)
        }
    })
}

async function showConfirmationDialog(): Promise<boolean> {
    const prompt = localize('AWS.docdb.deleteCluster.prompt', "Enter 'delete entire cluster' to confirm deletion")
    const confirmValue = localize('AWS.docdb.deleteCluster.confirmValue', 'delete entire cluster').toLowerCase()
    const confirmationInput = await vscode.window.showInputBox({
        prompt,
        placeHolder: confirmValue,
        validateInput: (input) => (input?.toLowerCase() !== confirmValue ? prompt : undefined),
    })

    return confirmationInput === confirmValue
}
