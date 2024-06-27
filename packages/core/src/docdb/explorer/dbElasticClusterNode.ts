/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { DBElasticCluster, DocumentDBClient } from '../../shared/clients/docdbClient'
import {
    DBClusterNodeContext,
    DBClusterPendingContext,
    DBClusterRunningContext,
    DBClusterStoppedContext,
} from './dbClusterNode'
import { DocumentDBNode } from './docdbNode'

/**
 * An AWS Explorer node representing DocumentDB elastic clusters.
 */
export class DBElasticClusterNode extends AWSTreeNodeBase implements AWSResourceNode {
    public override readonly regionCode: string
    name: string = this.cluster.clusterName ?? ''
    arn: string = this.cluster.clusterArn ?? ''

    constructor(
        public readonly parent: DocumentDBNode,
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

    private getContext(): DBClusterNodeContext {
        if (this.status === 'active') {
            return DBClusterRunningContext
        } else if (this.status === 'stopped') {
            return DBClusterStoppedContext
        }
        return DBClusterPendingContext
    }

    public getDescription(): string | boolean {
        if (this.contextValue !== (DBClusterRunningContext as string)) {
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
