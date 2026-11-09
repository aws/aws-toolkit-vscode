/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { DBClusterNode } from '../explorer/dbClusterNode'
import { CreateInstanceWizard } from '../wizards/createInstanceWizard'
import { CreateDBInstanceMessage } from '@aws-sdk/client-docdb'
import { DocDBEngine, MaxInstanceCount } from '../../shared/clients/docdbClient'

/**
 * Creates a DocumentDB instance.
 *
 * Prompts the user for the instance name and class.
 * Creates the instance.
 * Refreshes the cluster node.
 */
export async function createInstance(node: DBClusterNode) {
    getLogger().debug('docdb: CreateInstance called for: %O', node)

    await telemetry.docdb_createInstance.run(async () => {
        if (!node) {
            throw new ToolkitError('No node specified for CreateInstance')
        }

        const instances = await node.client.listInstances([node.arn])
        if (instances.length >= MaxInstanceCount) {
            void vscode.window.showInformationMessage(
                localize('AWS.docdb.createInstance.limitReached', 'Max instances in use')
            )
            throw new ToolkitError('Max instances in use', { code: 'documentDBMaxInstancesInUse' })
        }

        const generateInstanceName = (clusterName: string) =>
            instances.length === 0 ? clusterName : `${clusterName}${++instances.length}`

        const options = {
            implicitState: {
                DBInstanceIdentifier: generateInstanceName(node.cluster.DBClusterIdentifier ?? ''),
                DBInstanceClass: instances[0]?.DBInstanceClass,
            },
        }
        const wizard = new CreateInstanceWizard(node.regionCode, node.cluster, options, node.client)

        const result = await wizard.run()

        if (!result) {
            getLogger().debug('docdb: CreateInstance cancelled')
            throw new ToolkitError('User cancelled createInstance wizard', { cancelled: true })
        }

        const instanceName = result.DBInstanceIdentifier
        getLogger().info(`docdb: Creating instance: ${instanceName}`)

        try {
            const request: CreateDBInstanceMessage = {
                Engine: DocDBEngine,
                DBClusterIdentifier: node.cluster.DBClusterIdentifier,
                DBInstanceIdentifier: result.DBInstanceIdentifier,
                DBInstanceClass: result.DBInstanceClass !== '' ? result.DBInstanceClass : undefined,
            }

            const instance = await node.createInstance(request)

            getLogger().info('docdb: Created instance: %O', instance)
            void vscode.window.showInformationMessage(
                localize('AWS.docdb.createInstance.success', 'Creating instance: {0}', instanceName)
            )

            node.refresh()
            return instance
        } catch (e) {
            getLogger().error(`docdb: Failed to create instance ${instanceName}: %s`, e)
            void showViewLogsMessage(
                localize('AWS.docdb.createInstance.error', 'Failed to create instance: {0}', instanceName)
            )
            throw ToolkitError.chain(e, `Failed to create instance ${instanceName}`)
        }
    })
}
