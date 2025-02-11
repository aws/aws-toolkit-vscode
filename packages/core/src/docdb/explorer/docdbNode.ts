/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { DBElasticCluster, DocumentDBClient } from '../../shared/clients/docdbClient'
import { DBClusterNode } from './dbClusterNode'
import { DBElasticClusterNode } from './dbElasticClusterNode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { DBGlobalClusterNode } from './dbGlobalClusterNode'
import { DBCluster } from '@aws-sdk/client-docdb'
import { getLogger } from '../../shared/logger/logger'
import { DBResourceNode } from './dbResourceNode'

/**
 * An AWS Explorer node representing DocumentDB.
 *
 * Contains clusters for a specific region as child nodes.
 */
export class DocumentDBNode extends AWSTreeNodeBase {
    public override readonly regionCode: string

    public constructor(public readonly client: DocumentDBClient) {
        super('DocumentDB', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsDocDBNode'
        this.regionCode = client.regionCode
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return telemetry.docdb_listClusters.run(async () => {
            return await makeChildrenNodes({
                getChildNodes: () => {
                    return this.getClusterNodes()
                },
                getNoChildrenPlaceholderNode: async () =>
                    new PlaceholderNode(this, localize('AWS.explorerNode.docdb.noClusters', '[No Clusters found]')),
                sort: (item1, item2) => item1.name.localeCompare(item2.name),
            })
        })
    }

    private async getClusterNodes() {
        const [globalClusters, clusters, elasticClusters] = await Promise.all([
            this.client.listGlobalClusters(),
            this.client.listClusters(),
            this.client.listElasticClusters(),
        ])

        // contains clusters that are part of a global cluster
        const globalClusterMap = new Map<string, [DBCluster, DocumentDBClient]>()

        for (const globalCluster of globalClusters) {
            for (const member of globalCluster.GlobalClusterMembers ?? []) {
                const match = clusters.find((c) => c.DBClusterArn === member.DBClusterArn)
                if (match?.DBClusterArn) {
                    globalClusterMap.set(match.DBClusterArn, [match, this.client])
                }
            }
        }

        // contains clusters that are not part of a global cluster
        const regionalClusters = clusters.filter((c) => !globalClusterMap.has(c.DBClusterArn!))

        const nodes: DBResourceNode[] = []
        nodes.push(
            ...globalClusters.map((cluster) => new DBGlobalClusterNode(this, cluster, globalClusterMap, this.client))
        )
        getLogger().info(`Repopulating child regional clusters...`)
        nodes.push(...regionalClusters.map((cluster) => new DBClusterNode(this, cluster, this.client)))
        nodes.push(
            ...elasticClusters.map(
                (cluster) => new DBElasticClusterNode(this, cluster as DBElasticCluster, this.client)
            )
        )

        return nodes
    }

    public [inspect.custom](): string {
        return 'DocumentDBNode'
    }
}
