/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { DBCluster } from '@aws-sdk/client-docdb'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'

export class DBClusterNode extends AWSTreeNodeBase {
    constructor(readonly cluster: DBCluster) {
        super(cluster.DBClusterIdentifier ?? '[Cluster]', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsDocDBClusterNode'
    }

    public arn(): string | undefined {
        return this.cluster.DBClusterArn
    }

    public status(): string | undefined {
        return this.cluster.Status
    }

    public [inspect.custom](): string {
        return 'DBClusterNode'
    }
}
