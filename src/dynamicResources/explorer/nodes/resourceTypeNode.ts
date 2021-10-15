/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ChildNodeLoader, ChildNodePage } from '../../../awsexplorer/childNodeLoader'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'
import { getLogger } from '../../../shared/logger'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../../shared/treeview/nodes/errorNode'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../../shared/treeview/treeNodeUtilities'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { ResourcesNode } from './resourcesNode'
import { ResourceNode } from './resourceNode'
import { recordDynamicresourceListResource, Result } from '../../../shared/telemetry/telemetry'
import { CloudControl } from 'aws-sdk'
import { ResourceTypeMetadata } from '../../model/resources'

export const CONTEXT_VALUE_RESOURCE_OPERATIONS: any = {
    CREATE: 'Creatable',
    DELETE: 'Deletable',
    UPDATE: 'Updatable',
}
export const CONTEXT_VALUE_RESOURCE = 'ResourceNode'

export class ResourceTypeNode extends AWSTreeNodeBase implements LoadMoreNode {
    private readonly childLoader: ChildNodeLoader = new ChildNodeLoader(this, token => this.loadPage(token))
    private readonly childContextValue: string

    public constructor(
        public readonly parent: ResourcesNode,
        public readonly typeName: string,
        public readonly cloudControl: CloudControlClient,
        public readonly metadata: ResourceTypeMetadata
    ) {
        super(
            ResourceTypeNode.getFriendlyName(typeName),
            metadata.available ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        )
        this.tooltip = typeName
        const supportedOperations = metadata.operations
            ? metadata.operations.map(op => CONTEXT_VALUE_RESOURCE_OPERATIONS[op])
            : Object.values(CONTEXT_VALUE_RESOURCE_OPERATIONS)

        if (!metadata.available) {
            this.contextValue = 'UnavailableResourceTypeNode'
            this.description = !metadata.available ? 'Unavailable in region' : ''
        } else {
            const documentedContextValue = metadata.documentation ? 'Documented' : ''
            const createContextValue = supportedOperations.includes('Creatable') ? 'Creatable' : ''
            this.contextValue = `${documentedContextValue}${createContextValue}ResourceTypeNode`
        }

        this.childContextValue = supportedOperations.join('') + CONTEXT_VALUE_RESOURCE
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        if (!this.metadata.available) {
            return []
        }
        let result: Result = 'Succeeded'
        const children = await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
            getErrorNode: async (error: Error, logID: number) => {
                result = 'Failed'
                return new ErrorNode(this, error, logID)
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.resources.noResources', '[No resources found]')),
            sort: (nodeA: AWSTreeNodeBase, nodeB: AWSTreeNodeBase) => {
                if (nodeA instanceof ResourceNode && nodeB instanceof ResourceNode) {
                    return nodeA.identifier.localeCompare(nodeB.identifier)
                }
                return 0
            },
        })
        recordDynamicresourceListResource({
            resourceType: this.typeName,
            result: result,
        })
        return children
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

    private async loadPage(continuationToken: string | undefined): Promise<ChildNodePage<ResourceNode>> {
        getLogger().debug(`Loading page for %O using continuationToken %s`, this, continuationToken)
        const response = await this.cloudControl.listResources({
            TypeName: this.typeName,
            NextToken: continuationToken,
        })

        const newResources = response.ResourceDescriptions
            ? response.ResourceDescriptions.reduce(
                  (accumulator: ResourceNode[], current: CloudControl.ResourceDescription) => {
                      if (current.Identifier) {
                          accumulator.push(new ResourceNode(this, current.Identifier, this.childContextValue))
                      }
                      return accumulator
                  },
                  []
              )
            : []

        getLogger().debug(`Loaded resources: %O`, newResources)
        return {
            newContinuationToken: response.NextToken,
            newChildren: [...newResources],
        }
    }

    private static getFriendlyName(typeName: string): string {
        return typeName.startsWith('AWS::') ? typeName.substr(5) : typeName
    }
}
