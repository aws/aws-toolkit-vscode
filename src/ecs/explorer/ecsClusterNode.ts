/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { EcsNode } from './ecsNode'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
// import { ChildNodePage } from '../../awsexplorer/childNodeLoader'
// import { ext } from '../../shared/extensionGlobals'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
// import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { ChildNodeLoader } from '../../awsexplorer/childNodeLoader'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
// import { Workspace } from '../../shared/vscode/workspace'
// import { inspect } from 'util'
// import { getLogger } from '../../shared/logger'
import { EcsClient } from '../../shared/clients/ecsClient'
import { EcsServiceNode } from './ecsServiceNode'
import { ECS } from 'aws-sdk'

/**
 * Represents an ECS cluster
 */
export class EcsClusterNode extends AWSTreeNodeBase implements AWSResourceNode {
    //  private readonly childLoader: ChildNodeLoader

    public constructor(
        public readonly cluster: ECS.Cluster,
        public readonly parent: EcsNode,
        private readonly ecs: EcsClient,
    ) {
        super(cluster.clusterName!, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = this.cluster.clusterArn
        this.contextValue = 'awsEcsCluster'
        //  this.childLoader = new ChildNodeLoader(this, token => this.loadPage(token))
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const services = await this.ecs.listServices(this.cluster.clusterArn!)

                return services.map(service => new EcsServiceNode(service, this))
            },
            getErrorNode: async (error: Error, logID: number) =>
                new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.ecs.noServices', '[No Services found]')),
        })

    }

    public get arn(): string {
        return this.cluster.clusterArn!
    }

    public get name(): string {
        return this.cluster.clusterName!
    }
}
