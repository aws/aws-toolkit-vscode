/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { inspect } from 'util'
import { DocumentDBClient } from '../../shared/clients/docdbClient'
import { DBClusterNode } from './dbClusterNode'
import { DBElasticClusterNode } from './dbElasticClusterNode'

/**
 * An AWS Explorer node representing DocumentDB.
 *
 * Contains clusters for a specific region as child nodes.
 */
export class DocumentDBNode extends AWSTreeNodeBase {
    public constructor(private readonly client: DocumentDBClient) {
        super('DocumentDB', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsDocDBNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const nodes = []
                const clusters = await this.client.listClusters()
                nodes.push(...clusters.map(cluster => new DBClusterNode(cluster, this.client)))

                const elasticClusters = await this.client.listElasticClusters()
                nodes.push(...elasticClusters.map(cluster => new DBElasticClusterNode(cluster, this.client)))

                return nodes
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.docdb.noClusters', '[No Clusters found]')),
        })
    }

    public [inspect.custom](): string {
        return 'DocumentDBNode'
    }
}
