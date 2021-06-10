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
    // private readonly clustersNode: EcsClustersNode
    //private readonly taskDefinitionsNode: EcsTaskDefinitionsNode

    public constructor(private readonly ecs: EcsClient
    ) {
        super('ECS', vscode.TreeItemCollapsibleState.Collapsed)
        // this.clustersNode = new DefaultEcsClustersNode(this, this.getExtensionAbsolutePath)
        // this.taskDefinitionsNode = new DefaultEcsTaskDefinitionsNode(this, this.getExtensionAbsolutePath)
        // this.update()
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await this.ecs.listClusters()

                if (response.clusterArns) {
                    return response.clusterArns.map(cluster => new EcsClusterNode(cluster, this))
                } else {
                    const noCluster =  new EcsClusterNode('NO CLUSTERS', this)
                    return [noCluster]
                }
            },
            getErrorNode: async (error: Error, logID: number) =>
                new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.s3.noBuckets', '[No Buckets found]')),
        })
    }

    // public get regionCode(): string {
    //     return this.parent.regionCode
    // }

    // public async getChildren(): Promise<AWSTreeErrorHandlerNode[]> {
    //     return [
    //         this.clustersNode,
    //         this.taskDefinitionsNode
    //     ]
    // }

    // public update(): void {
    //     this.tooltip = this.label
    // }
}