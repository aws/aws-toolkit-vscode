/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode'
import { ChildNodeLoader, ChildNodePage } from '../../../awsexplorer/childNodeLoader'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import * as CloudFormation from '../../../shared/cloudformation/client/cloudformation'
import { getLogger } from '../../../shared/logger'
import { AWSTreeNodeBase } from "../../../shared/treeview/nodes/awsTreeNodeBase"
import { ErrorNode } from "../../../shared/treeview/nodes/errorNode"
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from "../../../shared/treeview/nodes/placeholderNode"
import { makeChildrenNodes } from "../../../shared/treeview/treeNodeUtilities"
import { localize } from "../../../shared/utilities/vsCodeUtils"
import { MoreResourcesNode } from "./moreResourcesNode"
import { ResourceNode } from "./resourceNode"

export class ResourceTypeNode extends AWSTreeNodeBase implements LoadMoreNode {

    private readonly childLoader: ChildNodeLoader

    public constructor(
        public readonly parent: MoreResourcesNode,
        public readonly typeName: string,
        public readonly cloudFormation: CloudFormationClient
    ) {
        super(typeName, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = typeName
        this.contextValue = 'resourceTypeNode'
        this.childLoader = new ChildNodeLoader(this, token => this.loadPage(token))
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () =>
                this.childLoader.getChildren(),
            getErrorNode: async (error: Error, logID: number) =>
                new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.moreResources.noResources', '[No resources found]')
                ),
            sort: (nodeA: ResourceNode, nodeB: ResourceNode) =>
                nodeA.identifier!.localeCompare(nodeB.identifier!),
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

    private async loadPage(continuationToken: string | undefined): Promise<ChildNodePage> {
        getLogger().debug(`Loading page for %O using continuationToken %s`, this, continuationToken)
        const maxResults = this.getMaxItemsPerPage()
        const response = await this.cloudFormation.listResources({
            typeName: this.typeName,
            maxResults: maxResults,
            nextToken: continuationToken
        })

        const newResources = response.ResourceDescriptions!.reduce(
            (accumulator: ResourceNode[], current: CloudFormation.ResourceDescription) => {
                if (current.Identifier) {
                    accumulator.push(new ResourceNode(this, current.Identifier))
                }
                return accumulator
            },
            []
        )

        getLogger().debug(`Loaded resources: %O`, newResources)
        return {
            newContinuationToken: response.NextToken,
            newChildren: [...newResources ],
        }
    }

    private getMaxItemsPerPage(): number | undefined {
        return vscode.workspace.getConfiguration('aws').get<number>('moreResources.maxItemsPerPage')
    }

}

 */
