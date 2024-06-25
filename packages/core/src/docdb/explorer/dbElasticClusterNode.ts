/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { DBElasticCluster, DocumentDBClient } from '../../shared/clients/docdbClient'

/**
 * An AWS Explorer node representing DocumentDB elastic clusters.
 */
export class DBElasticClusterNode extends AWSTreeNodeBase implements AWSResourceNode {
    name: string = this.cluster.clusterName ?? ''
    arn: string = this.cluster.clusterArn ?? ''

    constructor(readonly cluster: DBElasticCluster, readonly client: DocumentDBClient) {
        super(cluster.clusterName ?? '[Cluster]', vscode.TreeItemCollapsibleState.None)
        this.contextValue = 'awsDocDBElasticClusterNode'
        this.iconPath = new vscode.ThemeIcon('layers-dot') //TODO: determine icon for elastic cluster
        this.tooltip = `${this.name}\nStatus: ${this.status}`
    }

    public get status(): string | undefined {
        return this.cluster.status?.toLowerCase()
    }

    public [inspect.custom](): string {
        return 'DBElasticClusterNode'
    }
}
