/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { DBClusterNode } from '../explorer/dbClusterNode'
import { CreateInstanceWizard } from '../wizards/createInstanceWizard'
import { CreateDBInstanceMessage } from '@aws-sdk/client-docdb'

const MaxInstanceCount = 16

/**
 * Creates a DocumentDB instance.
 *
 * Prompts the user for the instance name and class.
 * Creates the instance.
 * Refreshes the cluster node.
 */
export async function createInstance(node: DBClusterNode) {
    getLogger().debug('CreateInstance called for: %O', node)

    if (!node) {
        throw new Error('No node specified for CreateInstance')
    }

    const instances = await node.client.listInstances([node.arn])
    if (instances.length >= MaxInstanceCount) {
        void vscode.window.showInformationMessage(
            localize('AWS.docdb.createInstance.limitReached', 'Max instances in use')
        )
        return
    }
    if (node.status !== 'available') {
        void vscode.window.showInformationMessage(
            localize('AWS.docdb.createInstance.clusterStopped', 'Cluster must be started to create instances')
        )
        return
    }

    const generateInstanceName = (clusterName: string) =>
        instances.length === 0 ? clusterName : `${clusterName}${++instances.length}`

    const options = {
        implicitState: {
            DBInstanceIdentifier: generateInstanceName(node.cluster.DBClusterIdentifier!),
            DBInstanceClass: instances[0]?.DBInstanceClass,
        },
    }
    const wizard = new CreateInstanceWizard(node.regionCode, node.cluster, options, node.client)

    const result = await wizard.run()

    if (!result) {
        getLogger().info('CreateInstance cancelled')
        return
    }

    if (result.DBInstanceIdentifier === '') {
        result.DBInstanceIdentifier = undefined!
    }

    if (result.DBInstanceClass === '') {
        result.DBInstanceClass = undefined!
    }

    const instanceName = result.DBInstanceIdentifier
    getLogger().info(`Creating instance: ${instanceName}`)

    try {
        const request: CreateDBInstanceMessage = {
            Engine: 'docdb',
            DBClusterIdentifier: node.cluster.DBClusterIdentifier,
            DBInstanceIdentifier: result.DBInstanceIdentifier,
            DBInstanceClass: result.DBInstanceClass,
        }

        const instance = await node.createInstance(request)

        getLogger().info('Created instance: %O', instance)
        void vscode.window.showInformationMessage(
            localize('AWS.docdb.createInstance.success', 'Creating instance: {0}', instanceName)
        )

        node.refresh()
        return instance
    } catch (e) {
        getLogger().error(`Failed to create instance ${instanceName}: %s`, e)
        void showViewLogsMessage(
            localize('AWS.docdb.createInstance.error', 'Failed to create instance: {0}', instanceName)
        )
    }
}
