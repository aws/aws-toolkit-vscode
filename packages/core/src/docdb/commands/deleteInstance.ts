/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { DBInstanceNode } from '../explorer/dbInstanceNode'
import { DBClusterNode } from '../explorer/dbClusterNode'

/**
 * Deletes a DocumentDB instance.
 *
 * Prompts the user for confirmation.
 * Deletes the instance.
 * Refreshes the parent cluster node.
 */
export async function deleteInstance(node: DBInstanceNode) {
    getLogger().debug('DeleteInstance called for: %O', node)

    if (!node) {
        throw new Error('No node specified for DeleteInstance')
    }

    const parent = node.parent as DBClusterNode
    const client = parent.client
    const instanceName = node.instance.DBInstanceIdentifier!

    if (parent?.cluster.DeletionProtection) {
        void vscode.window.showErrorMessage(
            localize(
                'AWS.docdb.deleteInstance.protected',
                'Instances cannot be deleted while deletion protection is enabled'
            )
        )
        return
    }

    if (node.instance.DBInstanceStatus !== 'available') {
        void vscode.window.showErrorMessage(
            localize('AWS.docdb.deleteInstance.instanceStopped', 'Instance must be running')
        )
        return
    }

    if (parent?.status !== 'available') {
        void vscode.window.showErrorMessage(
            localize('AWS.docdb.deleteInstance.clusterStopped', 'Cluster must be started to delete instances')
        )
        return
    }

    const isConfirmed = await showConfirmationDialog(instanceName)
    if (!isConfirmed) {
        getLogger().info('DeleteInstance cancelled')
        return
    }

    try {
        getLogger().info(`Deleting instance: ${instanceName}`)

        //const instance = node.instance
        const instance = await client.deleteInstance({
            DBInstanceIdentifier: instanceName,
        })

        getLogger().info('Deleted instance: %O', instance)
        void vscode.window.showInformationMessage(
            localize('AWS.docdb.deleteInstance.success', 'Deleting instance: {0}', instanceName)
        )

        parent.refresh()
        return instance
    } catch (e) {
        getLogger().error(`Failed to delete instance ${instanceName}: %s`, e)
        void showViewLogsMessage(
            localize('AWS.docdb.deleteInstance.error', 'Failed to delete instance: {0}', instanceName)
        )
    }
}

async function showConfirmationDialog(instanceName: string): Promise<boolean> {
    const prompt = localize('AWS.docdb.deleteInstance.prompt', 'Enter {0} to confirm deletion', instanceName)
    const confirmationInput = await vscode.window.showInputBox({
        prompt,
        placeHolder: instanceName,
        validateInput: input => (input !== instanceName ? prompt : undefined),
    })

    return confirmationInput === instanceName
}
