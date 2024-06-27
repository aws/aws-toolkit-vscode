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
import { DocumentDBNode } from './docdbNode'

export const DBClusterRunningContext = 'DBClusterRunningNode'
export const DBClusterStoppedContext = 'DBClusterStoppedNode'
export const DBClusterPendingContext = 'DBClusterPendingNode'

export type DBClusterNodeContext = 'DBClusterRunningNode' | 'DBClusterStoppedNode' | 'DBClusterPendingNode'

/**
 * An AWS Explorer node representing DocumentDB clusters.
 *
 * Contains instances for a specific cluster as child nodes.
 */
export class DBClusterNode extends AWSTreeNodeBase implements AWSResourceNode {
    public override readonly regionCode: string
    name: string = this.cluster.DBClusterIdentifier ?? ''
    arn: string = this.cluster.DBClusterArn ?? ''

    constructor(
        public readonly parent: DocumentDBNode,
        readonly cluster: DBCluster,
        readonly client: DocumentDBClient
    ) {
        super(cluster.DBClusterIdentifier ?? '[Cluster]', vscode.TreeItemCollapsibleState.Collapsed)
        this.id = cluster.DBClusterIdentifier
        this.regionCode = client.regionCode
        this.contextValue = this.getContext()
        this.iconPath = undefined //TODO: determine icon for regional cluster
        this.description = this.getDescription()
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
                const nodes = instances.map(instance => new DBInstanceNode(this, instance))
                return nodes
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.docdb.noInstances', '[No Instances found]')),
            sort: (item1, item2) => item1.name.localeCompare(item2.name),
        })
    }

    private getContext(): DBClusterNodeContext {
        if (this.status === 'available') {
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
        return this.cluster.Status
    }

    public [inspect.custom](): string {
        return 'DBClusterNode'
    }
}
