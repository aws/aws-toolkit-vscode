/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { DBResourceNode } from './dbResourceNode'
import { DBElasticCluster, DocumentDBClient } from '../../shared/clients/docdbClient'
import { DocDBContext, DocDBNodeContext } from './docdbContext'
import { copyToClipboard } from '../../shared/utilities/messages'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { waitUntil } from '../../shared'

/**
 * An AWS Explorer node representing DocumentDB elastic clusters.
 */
export class DBElasticClusterNode extends DBResourceNode {
    override name = this.cluster.clusterName!
    override arn = this.cluster.clusterArn!

    constructor(
        public readonly parent: AWSTreeNodeBase,
        public cluster: DBElasticCluster,
        client: DocumentDBClient
    ) {
        super(client, cluster.clusterName ?? '[Cluster]', vscode.TreeItemCollapsibleState.None)
        this.id = cluster.clusterArn
        this.contextValue = this.getContext()
        this.iconPath = new vscode.ThemeIcon('layers-dot') //TODO: determine icon for elastic cluster
        this.description = this.getDescription()
        this.tooltip = `${this.name}\nStatus: ${this.status}`
    }

    private getContext(): DocDBNodeContext {
        if (this.status === 'active') {
            return DocDBContext.ElasticClusterRunning
        } else if (this.status === 'stopped') {
            return DocDBContext.ElasticClusterStopped
        }
        return DocDBContext.Cluster
    }

    public getDescription(): string | boolean {
        if (this.contextValue !== (DocDBContext.ElasticClusterRunning as string)) {
            return `elastic cluster • ${this.status}`
        }
        return 'elastic cluster'
    }

    public async deleteCluster(finalSnapshotId: string | undefined): Promise<DBElasticCluster | undefined> {
        if (finalSnapshotId !== undefined) {
            void vscode.window.showInformationMessage(
                localize('AWS.docdb.deleteCluster.snapshot', 'Taking snapshot of cluster: {0}', this.name)
            )

            await this.client.createClusterSnapshot({
                clusterArn: this.cluster.clusterArn,
                snapshotName: finalSnapshotId,
            })
        }
        return await this.client.deleteElasticCluster(this.arn)
    }

    public get status(): string | undefined {
        return this.cluster.status?.toLowerCase()
    }

    public async waitUntilStatusChanged(): Promise<boolean> {
        const currentStatus = this.status

        await waitUntil(
            async () => {
                const cluster = await this.client.getElasticCluster(this.arn)
                return cluster?.status !== currentStatus
            },
            { timeout: 30000, interval: 500, truthy: true }
        )

        return false
    }

    public override getConsoleUrl() {
        const region = this.regionCode
        return vscode.Uri.parse(
            `https://${region}.console.aws.amazon.com/docdb/home?region=${region}#elastic-cluster-details/${this.arn}`
        )
    }

    override async copyEndpoint() {
        // get the full cluster record if we don't have it already
        if (this.cluster.clusterEndpoint === undefined) {
            this.cluster = (await this.client.getElasticCluster(this.arn)) ?? this.cluster
        }
        await copyToClipboard(this.cluster.clusterEndpoint!, this.name)
    }

    public [inspect.custom](): string {
        return 'DBElasticClusterNode'
    }
}
