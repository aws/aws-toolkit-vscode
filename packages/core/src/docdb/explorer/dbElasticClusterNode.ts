/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { DBElasticCluster, DocumentDBClient } from '../../shared/clients/docdbClient'
import { DocDBContext, DocDBNodeContext } from './docdbContext'

/**
 * An AWS Explorer node representing DocumentDB elastic clusters.
 */
export class DBElasticClusterNode extends AWSTreeNodeBase implements AWSResourceNode {
    public override readonly regionCode: string
    name: string = this.cluster.clusterName ?? ''
    arn: string = this.cluster.clusterArn ?? ''

    constructor(
        public readonly parent: AWSTreeNodeBase,
        readonly cluster: DBElasticCluster,
        readonly client: DocumentDBClient
    ) {
        super(cluster.clusterName ?? '[Cluster]', vscode.TreeItemCollapsibleState.None)
        this.id = cluster.clusterArn
        this.regionCode = client.regionCode
        this.contextValue = this.getContext()
        this.iconPath = new vscode.ThemeIcon('layers-dot') //TODO: determine icon for elastic cluster
        this.description = this.getDescription()
        this.tooltip = `${this.name}\nStatus: ${this.status}`
    }

    private getContext(): DocDBNodeContext {
        if (this.status === 'active') {
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

    public get status(): string | undefined {
        return this.cluster.status?.toLowerCase()
    }

    public [inspect.custom](): string {
        return 'DBElasticClusterNode'
    }
}
