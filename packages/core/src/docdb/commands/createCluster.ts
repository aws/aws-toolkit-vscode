/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger, ToolkitError } from '../../shared'
import { telemetry } from '../../shared/telemetry'
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

    await telemetry.docdb_createCluster.run(async (span) => {
        if (!node) {
            throw new ToolkitError('No node specified for CreateCluster')
        }

        span.record({ awsRegion: node?.client.regionCode })
        const wizard = new CreateClusterWizard(node?.regionCode ?? '', {}, node?.client)
        const result = await wizard.run()

        if (!result) {
            getLogger().info('CreateCluster canceled')
            throw new ToolkitError('User cancelled wizard', { cancelled: true })
        }

        const clusterName = result.DBClusterIdentifier
        getLogger().info(`Creating cluster: ${clusterName}`)

        try {
            const cluster = await node?.createCluster(result)

            // create instances for cluster
            if (cluster && result.DBInstanceCount) {
                const tasks = []

                for (let index = 0; index < result.DBInstanceCount; index++) {
                    tasks.push(
                        node.client.createInstance({
                            Engine: 'docdb',
                            DBClusterIdentifier: clusterName,
                            DBInstanceIdentifier: index === 0 ? clusterName : `${clusterName}${index + 1}`,
                            DBInstanceClass: result.DBInstanceClass ?? 'db.t3.medium',
                        })
                    )
                }

                try {
                    await Promise.all(tasks)
                } catch (e) {
                    throw ToolkitError.chain(e, `Failed to create instance for cluster ${clusterName}`, {
                        code: 'FailureCreatingInstanceForCluster',
                    })
                }
            }

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
            throw ToolkitError.chain(e, `Failed to create cluster ${clusterName}`)
        }
    })
}
