/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EcsClient } from '../../shared/clients/ecsClient'
import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { EcsClusterNode } from './ecsClusterNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { ChildNodeLoader, ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { getLogger } from '../../shared/logger/logger'

export class EcsNode extends AWSTreeNodeBase implements LoadMoreNode {
    private readonly childLoader: ChildNodeLoader

    public constructor(private readonly ecs: EcsClient) {
        super('ECS', vscode.TreeItemCollapsibleState.Collapsed)
        this.childLoader = new ChildNodeLoader(this, token => this.loadPage(token))
        this.contextValue = 'awsEcsNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.ecs.noClusters', '[No Clusters found]')),
        })
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
        const response = await this.ecs.listClusters(nextToken)
        const clusters = response.resource.map(c => new EcsClusterNode(c, this, this.ecs))

        getLogger().debug(
            `ecs: Loaded clusters: %O`,
            clusters.map(clusterNode => clusterNode.name)
        )
        return {
            newContinuationToken: response.nextToken,
            newChildren: [...clusters],
        }
    }
}
