/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { validateClusterName } from '../utils'
import { DBClusterNode } from '../explorer/dbClusterNode'

/**
 * Renames a DocumentDB cluster.
 *
 * Prompts the user for the new cluster name
 * Updates the cluster.
 * Refreshes the node.
 */
export async function renameCluster(node: DBClusterNode) {
    getLogger().debug('RenameCluster called for: %O', node)

    if (!node) {
        throw new Error('No node specified for RenameCluster')
    }

    const clusterName = node.cluster.DBClusterIdentifier

    if (node.cluster.Status !== 'available') {
        void vscode.window.showErrorMessage(
            localize('AWS.docdb.deleteCluster.clusterStopped', 'Cluster must be running')
        )
        return
    }

    const newClusterName = await vscode.window.showInputBox({
        prompt: localize('AWS.docdb.renameCluster.prompt', 'New cluster name'),
        value: clusterName,
        validateInput: validateClusterName,
    })

    if (!newClusterName) {
        getLogger().info('RenameCluster cancelled')
        return
    }

    try {
        const cluster = await node.renameCluster(newClusterName)

        getLogger().info('Renamed cluster: %O', cluster)
        void vscode.window.showInformationMessage(
            localize('AWS.docdb.renameCluster.success', 'Updated cluster: {0}', clusterName)
        )

        node.parent.refresh()
        return cluster
    } catch (e) {
        getLogger().error(`Failed to rename cluster ${clusterName}: %s`, e)
        void showViewLogsMessage(
            localize('AWS.docdb.renameCluster.error', 'Failed to rename cluster: {0}', clusterName)
        )
    }
}
