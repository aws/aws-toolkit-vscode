/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as vscode from 'vscode'
import { inspect } from 'util'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { waitUntil } from '../../shared'
import { CreateDBInstanceMessage, DBCluster, ModifyDBClusterMessage } from '@aws-sdk/client-docdb'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { DBResourceNode } from './dbResourceNode'
import { DBInstanceNode } from './dbInstanceNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { DBInstance, DocumentDBClient } from '../../shared/clients/docdbClient'
import { DocDBContext, DocDBNodeContext } from './docdbContext'
import { telemetry } from '../../shared/telemetry'

/**
 * An AWS Explorer node representing DocumentDB clusters.
 *
 * Contains instances for a specific cluster as child nodes.
 */
export class DBClusterNode extends DBResourceNode {
    override name = this.cluster.DBClusterIdentifier!
    override arn = this.cluster.DBClusterArn!

    constructor(
        public readonly parent: AWSTreeNodeBase,
        readonly cluster: DBCluster,
        client: DocumentDBClient
    ) {
        super(client, cluster.DBClusterIdentifier ?? '[Cluster]', vscode.TreeItemCollapsibleState.Collapsed)
        this.id = cluster.DBClusterIdentifier
        this.arn = cluster.DBClusterArn ?? ''
        this.name = cluster.DBClusterIdentifier ?? ''
        this.contextValue = this.getContext()
        this.iconPath = undefined //TODO: determine icon for regional cluster
        this.description = this.getDescription()
        this.tooltip = `${this.name}${os.EOL}Engine: ${this.cluster.EngineVersion}${os.EOL}Status: ${this.cluster.Status}`
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return telemetry.docdb_listInstances.run(async () => {
            return await makeChildrenNodes({
                getChildNodes: async () => {
                    const instances: DBInstance[] = (await this.client.listInstances([this.arn])).map((i) => {
                        const member = this.cluster.DBClusterMembers?.find(
                            (m) => m.DBInstanceIdentifier === i.DBInstanceIdentifier
                        )
                        return { ...i, ...member }
                    })
                    const nodes = instances.map((instance) => new DBInstanceNode(this, instance))
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

    private getContext(): DocDBNodeContext {
        if (this.status === 'available') {
            return DocDBContext.ClusterRunning
        } else if (this.status === 'stopped') {
            return DocDBContext.ClusterStopped
        }
        return DocDBContext.Cluster
    }

    public getDescription(): string | boolean {
        if (this.contextValue !== (DocDBContext.ClusterRunning as string)) {
            return this.status!
        }
        return false
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
        return await this.client.modifyCluster(request)
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

    public get status(): string | undefined {
        return this.cluster.Status
    }

    public async waitUntilStatusChanged(): Promise<boolean> {
        const currentStatus = this.status

        await waitUntil(
            async () => {
                const [cluster] = await this.client.listClusters(this.id)
                return cluster.Status !== currentStatus
            },
            { timeout: 30000, interval: 500, truthy: true }
        )

        return false
    }

    public [inspect.custom](): string {
        return 'DBClusterNode'
    }
}
