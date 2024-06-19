/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ChildNodeLoader, ChildNodePage } from '../../../awsexplorer/childNodeLoader'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'
import { getLogger } from '../../../shared/logger'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { createErrorItem, makeChildrenNodes, TreeShim } from '../../../shared/treeview/utils'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { ResourcesNode } from './resourcesNode'
import { ResourceNode } from './resourceNode'
import { Result } from '../../../shared/telemetry/telemetry'
import { CloudControl } from 'aws-sdk'
import { ResourceTypeMetadata } from '../../model/resources'
import { DefaultS3Client } from '../../../shared/clients/s3Client'
import { telemetry } from '../../../shared/telemetry/telemetry'

export const contextValueResourceOperations: any = {
    CREATE: 'Creatable',
    DELETE: 'Deletable',
    UPDATE: 'Updatable',
}
export const contextValueResource = 'ResourceNode'

const unavailableResource = localize('AWS.explorerNode.resources.unavailable', 'Unavailable in region')

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
            ? metadata.operations.map(op => contextValueResourceOperations[op])
            : Object.values(contextValueResourceOperations)

        if (!metadata.available) {
            this.contextValue = 'UnavailableResourceTypeNode'
            this.description = !metadata.available ? unavailableResource : ''
        } else {
            const documentedContextValue = metadata.documentation ? 'Documented' : ''
            const createContextValue = supportedOperations.includes('Creatable') ? 'Creatable' : ''
            this.contextValue = `${documentedContextValue}${createContextValue}ResourceTypeNode`
        }

        this.childContextValue = supportedOperations.join('') + contextValueResource
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        if (!this.metadata.available) {
            return []
        }
        let result: Result = 'Succeeded'
        const children = await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
            getErrorNode: (error: Error) => {
                if (error.name === 'UnsupportedActionException') {
                    result = 'Cancelled'
                    getLogger().warn(
                        `Resource type ${this.typeName} does not support LIST action in ${this.parent.region}`
                    )
                    return new PlaceholderNode(this, `[${unavailableResource}]`)
                } else {
                    result = 'Failed'
                    return new TreeShim(createErrorItem(error, `Resources: unexpected error: ${error.message}`))
                }
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
        telemetry.dynamicresource_listResource.emit({
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
        let newResources: ResourceNode[]
        let nextToken: string | undefined

        // S3::Bucket's resource handler LIST is not regionalized at this time
        if (this.typeName === 'AWS::S3::Bucket') {
            const s3 = new DefaultS3Client(this.parent.region)
            const buckets = await s3.listBuckets()
            newResources = buckets.buckets.map(bucket => new ResourceNode(this, bucket.name, this.childContextValue))
        } else {
            const response = await this.cloudControl.listResources({
                TypeName: this.typeName,
                NextToken: continuationToken,
            })

            newResources = response.ResourceDescriptions
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
            nextToken = response.NextToken
        }

        getLogger().debug(`Loaded resources: %O`, newResources)
        return {
            newContinuationToken: nextToken,
            newChildren: [...newResources],
        }
    }

    private static getFriendlyName(typeName: string): string {
        return typeName.startsWith('AWS::') ? typeName.slice(5) : typeName
    }
}
