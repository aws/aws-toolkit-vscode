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
import { DocumentDBNode } from '../explorer/docdbNode'
import { CreateClusterWizard } from '../wizards/createClusterWizard'
import { CreateClusterInput } from '@aws-sdk/client-docdb-elastic'
import { DocDBEngine, DocumentDBClient } from '../../shared/clients/docdbClient'

/**
 * Creates a DocumentDB cluster.
 *
 * Prompts the user for the cluster name.
 * Creates the cluster.
 * Refreshes the node.
 */
export async function createCluster(node?: DocumentDBNode) {
    getLogger().debug('docdb: CreateCluster called for: %O', node)

    await telemetry.docdb_createCluster.run(async (span) => {
        if (!node) {
            throw new ToolkitError('No node specified for CreateCluster')
        }

        span.record({ awsRegion: node?.client.regionCode })
        const wizard = new CreateClusterWizard(node?.client, {})
        const result = await wizard.run()

        if (!result) {
            getLogger().debug('docdb: createCluster cancelled')
            throw new ToolkitError('User cancelled createCluster wizard', { cancelled: true })
        }

        const clusterName = result.RegionalCluster?.DBClusterIdentifier ?? result.ElasticCluster?.clusterName
        getLogger().info(`docdb: Creating cluster: ${clusterName}`)
        let cluster

        try {
            if (result.ClusterType === 'elastic') {
                cluster = await node.client.createElasticCluster(result.ElasticCluster as CreateClusterInput)
            } else {
                cluster = await node.client.createCluster(result.RegionalCluster)

                // create instances for cluster
                if (cluster && result.RegionalCluster.DBInstanceCount) {
                    await createInstancesForCluster(
                        node.client,
                        clusterName,
                        result.RegionalCluster.DBInstanceClass,
                        result.RegionalCluster.DBInstanceCount
                    )
                }
            }

            getLogger().info('docdb: Created cluster: %O', cluster)
            void vscode.window.showInformationMessage(
                localize('AWS.docdb.createCluster.success', 'Created cluster: {0}', clusterName)
            )

            node?.refresh()
            return cluster
        } catch (e) {
            getLogger().error(`docdb: Failed to create cluster ${clusterName}: %s`, e)
            void showViewLogsMessage(
                localize('AWS.docdb.createCluster.error', 'Failed to create cluster: {0}', clusterName)
            )
            throw ToolkitError.chain(e, `Failed to create cluster ${clusterName}`)
        }
    })
}

export async function createInstancesForCluster(
    client: DocumentDBClient,
    clusterName: string,
    instanceClass: string = 'db.t3.medium',
    instanceCount: number
) {
    const tasks = []

    for (let index = 0; index < instanceCount; index++) {
        tasks.push(
            client.createInstance({
                Engine: DocDBEngine,
                DBClusterIdentifier: clusterName,
                DBInstanceIdentifier: index === 0 ? clusterName : `${clusterName}${index + 1}`,
                DBInstanceClass: instanceClass,
            })
        )
    }

    try {
        await Promise.all(tasks)
    } catch (e) {
        throw ToolkitError.chain(e, `Failed to create instance for cluster ${clusterName}`, {
            code: 'docdbCreateInstanceForCluster',
        })
    }
}
