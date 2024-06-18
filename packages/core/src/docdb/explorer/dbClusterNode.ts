/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { DBCluster } from '@aws-sdk/client-docdb'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { DBInstanceNode } from './dbInstanceNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'

/**
 * An AWS Explorer node representing DocumentDB clusters.
 *
 * Contains instances for a specific cluster as child nodes.
 */
export class DBClusterNode extends AWSTreeNodeBase implements AWSResourceNode {
    name: string = this.cluster.DBClusterIdentifier ?? ''
    arn: string = this.cluster.DBClusterArn ?? ''

    constructor(readonly cluster: DBCluster) {
        super(cluster.DBClusterIdentifier ?? '[Cluster]', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsDocDBClusterNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: () => {
                const nodes = this.cluster.DBClusterMembers?.map(instance => new DBInstanceNode(instance))
                return Promise.resolve(nodes ?? [])
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.docdb.noInstances', '[No Instances found]')),
            sort: (item1, item2) => item1.name.localeCompare(item2.name),
        })
    }

    public status(): string | undefined {
        return this.cluster.Status
    }

    public [inspect.custom](): string {
        return 'DBClusterNode'
    }
}
