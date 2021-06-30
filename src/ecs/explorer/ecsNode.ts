/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EcsClient } from '../../shared/clients/ecsClient'
import * as vscode from 'vscode'
// import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
// import { DefaultEcsClustersNode } from './ecsClustersNode'
import { EcsClusterNode } from './ecsClusterNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { localize } from '../../shared/utilities/vsCodeUtils'


export class EcsNode extends AWSTreeNodeBase {

    public constructor(private readonly ecs: EcsClient
    ) {
        super('ECS', vscode.TreeItemCollapsibleState.Collapsed)
        this.update()
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const clusters = await this.ecs.listClusters()
                
                return clusters.map(cluster => new EcsClusterNode(cluster, this, this.ecs))
            },
            getErrorNode: async (error: Error, logID: number) =>
                new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.ecs.noClusters', '[No Clusters found]')),
        })
    }

    public update(): void {
        this.tooltip = this.label
    }
}