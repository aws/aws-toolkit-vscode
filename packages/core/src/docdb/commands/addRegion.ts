/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { telemetry } from '../../shared/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { DBClusterNode } from '../explorer/dbClusterNode'
import { DefaultDocumentDBClient } from '../../shared/clients/docdbClient'
import { ToolkitError } from '../../shared'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { isValidResponse } from '../../shared/wizards/wizard'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { CreateGlobalClusterWizard } from '../wizards/createGlobalClusterWizard'
import { CreateDBClusterMessage } from '@aws-sdk/client-docdb'
import { createInstancesForCluster } from './createCluster'

export async function addRegion(node: DBClusterNode): Promise<void> {
    if (!node) {
        throw new ToolkitError('No node specified for AddRegion')
    }

    return telemetry.docdb_addRegion.run(async () => {
        if (node.clusterRole !== 'regional') {
            void vscode.window.showErrorMessage('Currently supported for standalone clusters only.')
            return
        }

        if (node.cluster.DBClusterMembers?.length === 0) {
            void vscode.window.showErrorMessage(
                localize('AWS.docdb.addRegion.noInstances', 'Cluster must have at least one instance to add a region')
            )
            throw new ToolkitError('Cluster must have at least one instance to add a region', { cancelled: true })
        }

        if (node.cluster.Status !== 'available') {
            void vscode.window.showErrorMessage(
                localize('AWS.docdb.deleteCluster.clusterStopped', 'Cluster must be running')
            )
            throw new ToolkitError('Cluster not available', { cancelled: true })
        }

        const wizard = new CreateGlobalClusterWizard(node.regionCode, node.cluster.EngineVersion, node.client, {
            initState: { GlobalClusterName: undefined }, //TODO: provide if adding to existing global cluster
        })
        const response = await wizard.run()

        if (!isValidResponse(response)) {
            throw new CancellationError('user')
        }

        let clusterName = response.GlobalClusterName
        const regionCode = response.RegionCode
        const primaryCluster = node.cluster

        try {
            getLogger().info(`Creating global cluster: ${clusterName}`)
            const globalCluster = await node.client.createGlobalCluster({
                GlobalClusterIdentifier: response.GlobalClusterName,
                SourceDBClusterIdentifier: primaryCluster.DBClusterArn,
            })

            clusterName = response.Cluster.DBClusterIdentifier
            const input: CreateDBClusterMessage = {
                GlobalClusterIdentifier: globalCluster?.GlobalClusterIdentifier,
                DBClusterIdentifier: response.Cluster.DBClusterIdentifier,
                DeletionProtection: primaryCluster.DeletionProtection,
                Engine: primaryCluster.Engine,
                EngineVersion: primaryCluster.EngineVersion,
                StorageType: primaryCluster.StorageType,
                StorageEncrypted: globalCluster?.StorageEncrypted,
            }

            getLogger().info(`Creating cluster: ${clusterName} in region ${regionCode}`)
            const client = DefaultDocumentDBClient.create(regionCode)
            const newCluster = await client.createCluster(input)

            if (response.Cluster.DBInstanceCount) {
                await createInstancesForCluster(
                    client,
                    clusterName,
                    response.Cluster.DBInstanceClass,
                    response.Cluster.DBInstanceCount
                )
            }

            getLogger().info('Created cluster: %O', newCluster)
            void vscode.window.showInformationMessage(localize('AWS.docdb.addRegion.success', 'Region added'))

            node?.parent.refresh()
        } catch (e) {
            getLogger().error(`Failed to create cluster ${clusterName}: %s`, e)
            void showViewLogsMessage(
                localize('AWS.docdb.createCluster.error', 'Failed to create cluster: {0}', clusterName)
            )
            throw ToolkitError.chain(e, `Failed to create cluster ${clusterName}`)
        }
    })
}
