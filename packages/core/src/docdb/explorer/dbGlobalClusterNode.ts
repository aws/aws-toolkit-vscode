/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { telemetry } from '../../shared/telemetry/telemetry'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { DBClusterNode, DBClusterRole } from './dbClusterNode'
import { DefaultDocumentDBClient, DocumentDBClient } from '../../shared/clients/docdbClient'
import { DBCluster, GlobalCluster, GlobalClusterMember, ModifyGlobalClusterMessage } from '@aws-sdk/client-docdb'
import { DBResourceNode } from './dbResourceNode'
import { DocDBContext } from './docdbContext'
import { copyToClipboard } from '../../shared/utilities/messages'
import { getAwsConsoleUrl } from '../../shared/awsConsole'
import { getLogger } from '../../shared/logger/logger'

function getRegionFromArn(arn: string) {
    const match = arn.match(/:rds:([^:]+):.*:cluster:/)
    return match?.at(1)
}

/**
 * An AWS Explorer node representing DocumentDB global clusters.
 *
 * Contains regional clusters of a global cluster as child nodes.
 */
export class DBGlobalClusterNode extends DBResourceNode {
    override name = this.cluster.GlobalClusterIdentifier!
    override arn = this.cluster.GlobalClusterArn!
    readonly clusterRole: DBClusterRole = 'global'

    constructor(
        public readonly parent: AWSTreeNodeBase,
        readonly cluster: GlobalCluster,
        private readonly clusterMap: Map<string, [DBCluster, DocumentDBClient]>,
        client: DocumentDBClient
    ) {
        super(client, cluster.GlobalClusterIdentifier ?? '[Cluster]', vscode.TreeItemCollapsibleState.Collapsed)
        this.arn = cluster.GlobalClusterArn ?? ''
        this.name = cluster.GlobalClusterIdentifier ?? ''
        this.contextValue = this.getContext()
        this.iconPath = new vscode.ThemeIcon('globe') // TODO: determine icon for global cluster
        this.description = 'Global cluster'
        this.tooltip = `${this.name}\nEngine: ${this.cluster.EngineVersion}\nStatus: ${this.cluster.Status} (read-only)`
        if (this.isStatusRequiringPolling()) {
            getLogger().debug(`${this.arn} requires polling.`)
            this.trackChanges()
        } else {
            getLogger().debug(`${this.arn} does NOT require polling.`)
        }
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return telemetry.docdb_listInstances.run(async () => {
            return await makeChildrenNodes({
                getChildNodes: async () => {
                    const members = this.cluster.GlobalClusterMembers ?? []
                    await this.getMemberClusters(members)

                    const nodes = members.map((member) => {
                        const memberRole: DBClusterRole = member.IsWriter ? 'primary' : 'secondary'
                        const [cluster, client] = this.clusterMap.get(member.DBClusterArn!) ?? []

                        return new DBClusterNode(this, cluster!, client!, memberRole)
                    })

                    return nodes
                },
                getNoChildrenPlaceholderNode: async () =>
                    new PlaceholderNode(this, localize('AWS.explorerNode.docdb.noClusters', '[No Clusters found]')),
                sort: (item1, item2) => {
                    if (item1.clusterRole === 'primary') {
                        return -1
                    }
                    if (item2.clusterRole === 'primary') {
                        return 1
                    }
                    return item1.name.localeCompare(item2.name)
                },
            })
        })
    }

    private getContext() {
        if (this.isAvailable) {
            return `${DocDBContext.GlobalCluster}-running`
        } else if (this.status === 'stopped') {
            return `${DocDBContext.GlobalCluster}-stopped`
        }
        return DocDBContext.GlobalCluster
    }

    // retrieve member cluster details from other regions
    private async getMemberClusters(members: GlobalClusterMember[]): Promise<void> {
        await Promise.all(
            members.map(async (member) => {
                if (!this.clusterMap.has(member.DBClusterArn!)) {
                    const regionCode = getRegionFromArn(member.DBClusterArn!)
                    if (regionCode) {
                        const client = DefaultDocumentDBClient.create(regionCode)
                        const [cluster] = await client.listClusters(member.DBClusterArn!)
                        this.clusterMap.set(member.DBClusterArn!, [cluster, client])
                    }
                }
            })
        )
    }

    public async renameCluster(clusterName: string): Promise<DBCluster | undefined> {
        const request: ModifyGlobalClusterMessage = {
            GlobalClusterIdentifier: this.cluster.GlobalClusterIdentifier,
            NewGlobalClusterIdentifier: clusterName,
        }
        const response = await this.client.modifyGlobalCluster(request)
        this.name = response?.GlobalClusterIdentifier ?? this.name
        return response
    }

    override get status() {
        return this.cluster.Status
    }

    override async getStatus() {
        const client = DefaultDocumentDBClient.create(this.regionCode)
        const clusters = await client.listClusters(this.arn)
        const cluster = clusters[0]

        if (!cluster) {
            getLogger().warn(`No global cluster found for ARN: ${this.arn}`)
            return undefined
        }

        getLogger().debug(`Get Status: status ${cluster.Status} for global cluster ${this.arn}`)
        this.cluster.Status = cluster.Status
        return cluster.Status
    }

    override copyEndpoint(): Promise<void> {
        return copyToClipboard(this.cluster.GlobalClusterResourceId!, this.name)
    }

    override getConsoleUrl(): vscode.Uri {
        return getAwsConsoleUrl('docdb', this.regionCode).with({
            fragment: `global-cluster-details/${this.name}`,
        })
    }

    override refreshTree(): void {
        getLogger().debug(`(DBGlobalClusterNode) Refreshing tree for instance: ${this.arn}`)
        this.refresh()
        this.parent.refresh()
    }

    override clearTimer(): void {
        this.pollingSet.delete(this.arn)
        this.pollingSet.clearTimer()
    }

    public override [inspect.custom](): string {
        return 'DBGlobalClusterNode'
    }
}
