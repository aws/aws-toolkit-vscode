/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { assertNodeAvailable, validateClusterName } from '../utils'
import { DBClusterNode } from '../explorer/dbClusterNode'
import { DBGlobalClusterNode } from '../explorer/dbGlobalClusterNode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { sleep } from '../../shared/utilities/timeoutUtils'

/**
 * Renames a DocumentDB cluster.
 *
 * Prompts the user for the new cluster name
 * Updates the cluster.
 * Refreshes the node.
 */
export async function renameCluster(node: DBClusterNode | DBGlobalClusterNode) {
    getLogger().debug('docdb: RenameCluster called for: %O', node)

    await telemetry.docdb_renameCluster.run(async () => {
        assertNodeAvailable(node, 'RenameCluster')
        const clusterName = node.name

        const newClusterName = await vscode.window.showInputBox({
            prompt: localize('AWS.docdb.renameCluster.prompt', 'New cluster name'),
            value: clusterName,
            validateInput: validateClusterName,
        })

        if (!newClusterName) {
            getLogger().debug('docdb: RenameCluster cancelled')
            throw new ToolkitError('User cancelled renameCluster', { cancelled: true })
        }

        try {
            const cluster = await node.renameCluster(newClusterName)

            getLogger().info('docdb: Renamed cluster: %O', cluster)
            void vscode.window.showInformationMessage(
                localize('AWS.docdb.renameCluster.success', 'Updated cluster: {0}', clusterName)
            )

            await sleep(1000) // wait for server to update status
            node.parent.refresh()
            return cluster
        } catch (e) {
            getLogger().error(`docdb: Failed to rename cluster ${clusterName}: %s`, e)
            void showViewLogsMessage(
                localize('AWS.docdb.renameCluster.error', 'Failed to rename cluster: {0}', clusterName)
            )
            throw ToolkitError.chain(e, `Failed to rename cluster ${clusterName}`)
        }
    })
}
