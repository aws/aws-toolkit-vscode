/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { DBClusterNode } from '../explorer/dbClusterNode'
import { DBGlobalClusterNode } from '../explorer/dbGlobalClusterNode'
import { DefaultDocumentDBClient } from '../../shared/clients/docdbClient'
import { ToolkitError } from '../../shared/errors'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { isValidResponse } from '../../shared/wizards/wizard'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { CreateGlobalClusterWizard } from '../wizards/createGlobalClusterWizard'
import { CreateDBClusterMessage } from '@aws-sdk/client-docdb'
import { createInstancesForCluster } from './createCluster'
import { isSupportedGlobalInstanceClass } from '../utils'

export async function addRegion(node: DBClusterNode | DBGlobalClusterNode): Promise<void> {
    if (!node) {
        throw new ToolkitError('No node specified for AddRegion')
    }

    return telemetry.docdb_addRegion.run(async () => {
        let globalClusterName = undefined

        if (node.cluster.StorageEncrypted) {
            void vscode.window.showErrorMessage('Encrypted clusters are not supported')
            return
        }

        if (node instanceof DBClusterNode) {
            if (node.clusterRole !== 'regional') {
                void vscode.window.showErrorMessage('Only regional clusters are supported')
                return
            }

            if (node.cluster.DBClusterMembers?.length === 0) {
                void vscode.window.showErrorMessage(
                    localize(
                        'AWS.docdb.addRegion.noInstances',
                        'Cluster must have at least one instance to add a region'
                    )
                )
                throw new ToolkitError('Cluster must have at least one instance to add a region', { cancelled: true })
            }

            const unsupportedInstanceFound = node.instances.find(
                (instance) => !isSupportedGlobalInstanceClass(instance.DBInstanceClass!)
            )

            if (unsupportedInstanceFound) {
                void vscode.window.showErrorMessage(
                    localize(
                        'AWS.docdb.addRegion.unsupportedInstanceClass',
                        'Instance class {0} not supported for global cluster.  Upgrade the instances then try again.',
                        unsupportedInstanceFound.DBInstanceClass
                    )
                )
                throw new ToolkitError('Instance class not supported for global cluster', {
                    cancelled: true,
                    code: 'docdbInstanceClassNotSupported',
                })
            }
        } else {
            globalClusterName = node.cluster.GlobalClusterIdentifier

            if (node.cluster.GlobalClusterMembers!.length > 4) {
                void vscode.window.showErrorMessage(
                    localize('AWS.docdb.addRegion.maxRegions', 'Global clusters can have a maximum of 5 regions')
                )
                throw new ToolkitError('Global clusters can have a maximum of 5 regions', {
                    cancelled: true,
                    code: 'docdbMaxRegionsInUse',
                })
            }
        }

        if (!node.isAvailable) {
            void vscode.window.showErrorMessage(localize('AWS.docdb.clusterStopped', 'Cluster must be running'))
            throw new ToolkitError('Cluster not available', { cancelled: true, code: 'docdbClusterStopped' })
        }

        const wizard = new CreateGlobalClusterWizard(node.regionCode, node.cluster.EngineVersion, node.client, {
            initState: { GlobalClusterName: globalClusterName },
        })
        const response = await wizard.run()

        if (!isValidResponse(response)) {
            throw new CancellationError('user')
        }

        const regionCode = response.RegionCode
        let input: CreateDBClusterMessage
        let clusterName = response.GlobalClusterName

        try {
            if (node instanceof DBClusterNode) {
                // Create new global cluster from regional cluster
                const primaryCluster = node.cluster

                getLogger().info(`docdb: Creating global cluster: ${clusterName}`)
                const globalCluster = await node.client.createGlobalCluster({
                    GlobalClusterIdentifier: response.GlobalClusterName,
                    SourceDBClusterIdentifier: primaryCluster.DBClusterArn,
                })

                input = {
                    GlobalClusterIdentifier: globalCluster?.GlobalClusterIdentifier,
                    DBClusterIdentifier: response.Cluster.DBClusterIdentifier,
                    DeletionProtection: primaryCluster.DeletionProtection,
                    Engine: primaryCluster.Engine,
                    EngineVersion: primaryCluster.EngineVersion,
                    StorageType: primaryCluster.StorageType,
                    StorageEncrypted: globalCluster?.StorageEncrypted,
                }
            } else {
                // Add secondary cluster to global cluster
                const globalCluster = node.cluster

                input = {
                    GlobalClusterIdentifier: globalClusterName,
                    DBClusterIdentifier: response.Cluster.DBClusterIdentifier,
                    DeletionProtection: globalCluster.DeletionProtection,
                    Engine: globalCluster.Engine,
                    EngineVersion: globalCluster.EngineVersion,
                    StorageEncrypted: globalCluster.StorageEncrypted,
                }
            }

            clusterName = response.Cluster.DBClusterIdentifier
            getLogger().info(`docdb: Creating secondary cluster: ${clusterName} in region ${regionCode}`)

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

            getLogger().info('docdb: Created cluster: %O', newCluster)
            void vscode.window.showInformationMessage(localize('AWS.docdb.addRegion.success', 'Region added'))

            if (node instanceof DBClusterNode) {
                node?.parent.refresh()
            } else {
                node?.refresh()
            }
        } catch (e) {
            getLogger().error(`docdb: Failed to create cluster ${clusterName}: %s`, e)
            void showViewLogsMessage(
                localize('AWS.docdb.createCluster.error', 'Failed to create cluster: {0}', clusterName)
            )
            throw ToolkitError.chain(e, `Failed to create cluster ${clusterName}`)
        }
    })
}
