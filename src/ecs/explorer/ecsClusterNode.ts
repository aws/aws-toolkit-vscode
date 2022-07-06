/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { EcsNode } from './ecsNode'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { ChildNodeLoader, ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { EcsClient } from '../../shared/clients/ecsClient'
import { EcsServiceNode } from './ecsServiceNode'
import { ECS } from 'aws-sdk'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { getLogger } from '../../shared/logger'
import { getIcon } from '../../shared/icons'

/**
 * Represents an ECS cluster
 */
export class EcsClusterNode extends AWSTreeNodeBase implements AWSResourceNode, LoadMoreNode {
    private readonly childLoader: ChildNodeLoader

    public constructor(
        public readonly cluster: ECS.Cluster,
        public readonly parent: EcsNode,
        private readonly ecs: EcsClient
    ) {
        super(cluster.clusterName!, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = this.cluster.clusterArn
        this.contextValue = 'awsEcsClusterNode'
        this.childLoader = new ChildNodeLoader(this, token => this.loadPage(token))

        this.iconPath = getIcon('aws-ecs-cluster')
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
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

    public async loadMoreChildren(): Promise<void> {
        await this.childLoader.loadMoreChildren()
    }

    public isLoadingMoreChildren(): boolean {
        return this.childLoader.isLoadingMoreChildren()
    }

    public clearChildren(): void {
        this.childLoader.clearChildren()
    }

    private async loadPage(nextToken: string | undefined): Promise<ChildNodePage> {
        getLogger().debug(`ecs: Loading page for %O using continuationToken %s`, this, nextToken)
        const response = await this.ecs.getServices(this.cluster.clusterArn!, nextToken)

        const services = response.resource.map(s => new EcsServiceNode(s, this, this.ecs))

        getLogger().debug(
            `ecs: Loaded services: %O`,
            services.map(serviceNode => serviceNode.name)
        )
        return {
            newContinuationToken: response.nextToken,
            newChildren: [...services],
        }
    }
}
