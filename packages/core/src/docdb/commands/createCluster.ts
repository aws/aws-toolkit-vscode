/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { DocumentDBNode } from '../explorer/docdbNode'
import { CreateClusterWizard } from '../wizards/createClusterWizard'

/**
 * Creates a DocumentDB cluster.
 *
 * Prompts the user for the cluster name.
 * Creates the cluster.
 * Refreshes the node.
 */
export async function createCluster(node?: DocumentDBNode) {
    getLogger().debug('CreateCluster called for: %O', node)

    const wizard = new CreateClusterWizard(node?.regionCode ?? '', {}, node?.client)
    const result = await wizard.run()

    if (!result) {
        getLogger().info('CreateCluster canceled')
        return
    }

    const clusterName = result.DBClusterIdentifier
    getLogger().info(`Creating cluster: ${clusterName}`)

    try {
        const cluster = await node?.createCluster(result)

        getLogger().info('Created cluster: %O', cluster)
        void vscode.window.showInformationMessage(
            localize('AWS.docdb.createCluster.success', 'Created cluster: {0}', clusterName)
        )

        node?.refresh()
        return cluster
    } catch (e) {
        getLogger().error(`Failed to create cluster ${clusterName}: %s`, e)
        void showViewLogsMessage(
            localize('AWS.docdb.createCluster.error', 'Failed to create cluster: {0}', clusterName)
        )
    }
}
