/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { ResourceList } from '../../cfn/resourceRequestTypes'
import { ResourceNode } from './resourceNode'
import { commandKey } from '../../utils'
import { ResourcesManager } from '../../resources/resourcesManager'
import {
    LoadMoreResourcesContextValue,
    ResourceTypeContextValue,
    ResourceTypeWithMoreContextValue,
} from '../contextValue'

class LoadMoreResourcesNode extends AWSTreeNodeBase {
    public constructor(private readonly parent: ResourceTypeNode) {
        super('[Load More...]', TreeItemCollapsibleState.None)
        this.contextValue = LoadMoreResourcesContextValue
        this.command = {
            title: 'Load More',
            command: commandKey('api.loadMoreResources'),
            arguments: [this.parent],
        }
    }
}

class NoResourcesNode extends AWSTreeNodeBase {
    public constructor() {
        super('No resources found', TreeItemCollapsibleState.None)
        this.contextValue = 'noResources'
        this.iconPath = new ThemeIcon('info')
    }
}

export class ResourceTypeNode extends AWSTreeNodeBase {
    private loaded = false

    public constructor(
        public readonly typeName: string,
        private readonly resourcesManager: ResourcesManager,
        private resourceList?: ResourceList
    ) {
        super(typeName, TreeItemCollapsibleState.Collapsed)
        this.loaded = resourceList !== undefined
        this.updateNode()
    }

    private updateNode(): void {
        if (!this.resourceList) {
            this.description = undefined
            this.contextValue = ResourceTypeContextValue
            return
        }
        const count = this.resourceList.resourceIdentifiers.length
        const hasMore = this.resourceList.nextToken !== undefined
        this.description = hasMore ? `(${count}+)` : `(${count})`
        this.contextValue = hasMore ? ResourceTypeWithMoreContextValue : ResourceTypeContextValue
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        if (!this.loaded) {
            await this.resourcesManager.loadResourceType(this.typeName)
            this.resourceList = this.resourcesManager.get().find((r) => r.typeName === this.typeName)
            this.loaded = true
            this.updateNode()
        }

        if (!this.resourceList || this.resourceList.resourceIdentifiers.length === 0) {
            return [new NoResourcesNode()]
        }

        const nodes = this.resourceList.resourceIdentifiers.map(
            (identifier) => new ResourceNode(identifier, this.typeName)
        )

        return this.resourceList.nextToken ? [...nodes, new LoadMoreResourcesNode(this)] : nodes
    }

    public async loadMoreResources(): Promise<void> {
        if (!this.resourceList?.nextToken) {
            return
        }

        await this.resourcesManager.loadMoreResources(this.typeName, this.resourceList.nextToken)

        this.resourceList = this.resourcesManager.get().find((r) => r.typeName === this.typeName)
        this.updateNode()
    }
}
