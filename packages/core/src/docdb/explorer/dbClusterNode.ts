/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as vscode from 'vscode'
import { inspect } from 'util'
import { copyToClipboard } from '../../shared/utilities/messages'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { telemetry } from '../../shared/telemetry/telemetry'
import { CreateDBInstanceMessage, DBCluster, ModifyDBClusterMessage } from '@aws-sdk/client-docdb'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { DBResourceNode } from './dbResourceNode'
import { DBInstanceNode } from './dbInstanceNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { DBInstance, DocumentDBClient } from '../../shared/clients/docdbClient'
import { DocDBContext } from './docdbContext'
import { toTitleCase } from '../../shared/utilities/textUtilities'
import { getAwsConsoleUrl } from '../../shared/awsConsole'
import { getLogger } from '../../shared/logger/logger'

export type DBClusterRole = 'global' | 'regional' | 'primary' | 'secondary'

/**
 * An AWS Explorer node representing DocumentDB clusters.
 *
 * Contains instances for a specific cluster as child nodes.
 */
export class DBClusterNode extends DBResourceNode {
    override name = this.cluster.DBClusterIdentifier!
    override arn = this.cluster.DBClusterArn!
    public instances: DBInstance[] = []
    private childNodes: DBInstanceNode[] = []

    constructor(
        public readonly parent: AWSTreeNodeBase,
        readonly cluster: DBCluster,
        client: DocumentDBClient,
        readonly clusterRole: DBClusterRole = 'regional'
    ) {
        super(client, cluster.DBClusterIdentifier ?? '[Cluster]', vscode.TreeItemCollapsibleState.Collapsed)
        getLogger().debug(`NEW DBClusterNode: ${cluster.DBClusterArn}`)
        this.arn = cluster.DBClusterArn ?? ''
        this.name = cluster.DBClusterIdentifier ?? ''
        this.contextValue = this.getContext()
        this.iconPath = new vscode.ThemeIcon(
            this.isAvailable ? 'layers-active' : this.isStopped ? 'layers-dot' : 'loading~spin'
        )
        this.description = this.getDescription()
        this.tooltip = `${this.name}${os.EOL}Engine: ${this.cluster.EngineVersion}${os.EOL}Status: ${this.cluster.Status}`
        if (this.isStatusRequiringPolling()) {
            getLogger().debug(`${this.arn} requires polling.`)
            this.trackChanges()
        } else {
            getLogger().debug(`${this.arn} does NOT require polling.`)
        }
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        getLogger().debug(`DBClusterNode.getChildren() called`)
        return telemetry.docdb_listInstances.run(async () => {
            return await makeChildrenNodes({
                getChildNodes: async () => {
                    this.instances = (await this.client.listInstances([this.arn])).map((i) => {
                        const member = this.cluster.DBClusterMembers?.find(
                            (m) => m.DBInstanceIdentifier === i.DBInstanceIdentifier
                        )
                        return { ...i, ...member }
                    })
                    const nodes = this.instances.map((instance) => new DBInstanceNode(this, instance))
                    this.childNodes = nodes
                    return nodes
                },
                getNoChildrenPlaceholderNode: async () => {
                    const title = localize('AWS.explorerNode.docdb.addInstance', 'Add instance...')
                    const placeholder = new PlaceholderNode(this, title)
                    placeholder.contextValue = 'awsDocDB.placeholder'
                    placeholder.command = { title, command: 'aws.docdb.createInstance', arguments: [this] }
                    return placeholder
                },
                sort: (item1, item2) => item1.name.localeCompare(item2.name),
            })
        })
    }

    private getContext() {
        const context = `${DocDBContext.Cluster}-${this.clusterRole}`
        if (this.isAvailable) {
            return `${context}-running`
        } else if (this.isStopped) {
            return `${context}-stopped`
        }
        return context
    }

    public getDescription(): string | boolean {
        const role = toTitleCase(this.clusterRole)
        if (!this.isAvailable) {
            return `${role} cluster • ${toTitleCase(this.status ?? ' ')}`
        }
        return `${role} cluster`
    }

    public async createInstance(request: CreateDBInstanceMessage): Promise<DBInstance | undefined> {
        return await this.client.createInstance(request)
    }

    public async renameCluster(clusterName: string): Promise<DBCluster | undefined> {
        const request: ModifyDBClusterMessage = {
            DBClusterIdentifier: this.cluster.DBClusterIdentifier,
            NewDBClusterIdentifier: clusterName,
            ApplyImmediately: true,
        }
        const response = await this.client.modifyCluster(request)
        this.name = response?.DBClusterIdentifier ?? this.name
        return response
    }

    public async deleteCluster(finalSnapshotId: string | undefined): Promise<DBCluster | undefined> {
        const instances = await this.client.listInstances([this.arn])

        const tasks = []
        for (const instance of instances) {
            tasks.push(
                this.client.deleteInstance({
                    DBInstanceIdentifier: instance.DBInstanceIdentifier,
                })
            )
        }
        await Promise.all(tasks)

        return await this.client.deleteCluster({
            DBClusterIdentifier: this.cluster.DBClusterIdentifier,
            FinalDBSnapshotIdentifier: finalSnapshotId,
            SkipFinalSnapshot: finalSnapshotId === undefined,
        })
    }

    override get status() {
        return this.cluster.Status
    }

    override async getStatus() {
        const clusters = await this.client.listClusters(this.arn)
        const cluster = clusters[0]

        if (!cluster) {
            getLogger().warn(`No cluster found for ARN: ${this.arn}`)
            return undefined
        }

        getLogger().debug(`Get Status: status ${cluster.Status} for cluster ${this.arn}`)

        this.cluster.Status = cluster.Status
        return cluster.Status
    }

    override getConsoleUrl() {
        return getAwsConsoleUrl('docdb', this.regionCode).with({
            fragment: `cluster-details/${this.name}`,
        })
    }

    override copyEndpoint() {
        if (this.cluster.Endpoint) {
            return copyToClipboard(this.cluster.Endpoint, this.name)
        }
        return Promise.reject()
    }

    override refreshTree(): void {
        getLogger().debug(`(DBClusterNode) Refreshing tree for instance: ${this.arn}`)
        this.refresh()
        this.parent.refresh()
    }

    override clearTimer(): void {
        this.pollingSet.delete(this.arn)
        this.pollingSet.clearTimer()
        for (const node of this.childNodes) {
            getLogger().debug(`(clearTimer) Removing Polling from node: ${node.arn}`)
            node.pollingSet.delete(node.arn)
            node.pollingSet.clearTimer()
        }
    }

    public override [inspect.custom](): string {
        return 'DBClusterNode'
    }
}
