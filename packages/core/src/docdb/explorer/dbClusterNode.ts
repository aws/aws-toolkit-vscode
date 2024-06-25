/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as vscode from 'vscode'
import { inspect } from 'util'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { DBCluster } from '@aws-sdk/client-docdb'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { DBInstanceNode } from './dbInstanceNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { DBInstance, DocumentDBClient } from '../../shared/clients/docdbClient'

/**
 * An AWS Explorer node representing DocumentDB clusters.
 *
 * Contains instances for a specific cluster as child nodes.
 */
export class DBClusterNode extends AWSTreeNodeBase implements AWSResourceNode {
    name: string = this.cluster.DBClusterIdentifier ?? ''
    arn: string = this.cluster.DBClusterArn ?? ''

    constructor(readonly cluster: DBCluster, readonly client: DocumentDBClient) {
        super(cluster.DBClusterIdentifier ?? '[Cluster]', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsDocDBClusterNode'
        this.iconPath = undefined //TODO: determine icon for regional cluster
        this.tooltip = `${this.name}${os.EOL}Engine: ${this.cluster.EngineVersion}${os.EOL}Status: ${this.cluster.Status}`
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const instances: DBInstance[] = (await this.client.listInstances([this.arn])).map(i => {
                    const member = this.cluster.DBClusterMembers?.find(
                        m => m.DBInstanceIdentifier === i.DBInstanceIdentifier
                    )
                    return { ...i, ...member }
                })
                const nodes = instances.map(instance => new DBInstanceNode(instance))
                return nodes
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
