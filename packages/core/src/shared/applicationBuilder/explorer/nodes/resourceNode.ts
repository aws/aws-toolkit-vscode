/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIcon } from '../../../icons'
import { TreeNode } from '../../../treeview/resourceTreeDataProvider'
import { ResourceTreeEntity, SamAppLocation } from '../samProject'
import { SERVERLESS_FUNCTION_TYPE } from '../../../cloudformation/cloudformation'
import { generatePropertyNodes } from './propertyNode'
import { generateDeployedLocalNode } from './deployedNode'
import { StackResource } from '../../../../lambda/commands/listSamResources'

enum ResourceTypeId {
    Function = 'function',
    Api = 'api',
    Other = '',
}

export class ResourceNode implements TreeNode {
    public readonly id = this.resourceTreeEntity.Id
    private readonly type = this.resourceTreeEntity.Type
    public readonly resourceLogicalId = this.deployedResource?.LogicalResourceId

    public constructor(
        private readonly location: SamAppLocation,
        private readonly resourceTreeEntity: ResourceTreeEntity,
        private readonly stackName?: string,
        private readonly region?: string,
        private readonly deployedResource?: StackResource
    ) {}

    public get resource() {
        return {
            resource: this.resourceTreeEntity,
            location: this.location.samTemplateUri,
            workspaceFolder: this.location.workspaceFolder,
            region: this.region,
            stackName: this.stackName,
            deployedResource: this.deployedResource,
        }
    }

    public async getChildren() {
        let deployedNode: TreeNode[] = []

        if (this.deployedResource && this.region && this.stackName) {
            deployedNode = await generateDeployedLocalNode(this.deployedResource, this.region, this.stackName)
        }
        return [...generatePropertyNodes(this.resourceTreeEntity), ...deployedNode]
    }

    public getTreeItem(): vscode.TreeItem {
        // Determine the initial TreeItem collapsible state based on the type
        const collapsibleState =
            this.type === SERVERLESS_FUNCTION_TYPE
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None

        // Create the TreeItem with the determined collapsible state
        const item = new vscode.TreeItem(this.resourceTreeEntity.Id, collapsibleState)

        // Set the tooltip to the URI of the SAM template
        item.tooltip = this.location.samTemplateUri.toString()

        // Assign iconPath based on the type
        if (this.type === SERVERLESS_FUNCTION_TYPE) {
            // We could set item.iconPath = getIcon('aws-lambda-function'), but if item.iconPath is undefined,
            // VS Code will display a default '!' icon. Currently, we're intentionally leaving icons undefined
            // for other resources until we receive a final UX decision on their icons.
            item.iconPath = getIcon('aws-lambda-function')
        }

        // Set the resource URI to the SAM template URI
        item.resourceUri = this.location.samTemplateUri

        // Define the context value for the item
        item.contextValue = `awsAppBuilderResourceNode.${this.getResourceId()}`

        return item
    }

    // We plan on adding more resources and icons for those resource. Awaiting UX decision
    // private getIconPath(): IconPath | undefined {
    //     switch (this.type) {
    //         case SERVERLESS_FUNCTION_TYPE:
    //             return getIcon('aws-lambda-function')
    //         case 'Api':
    //             return getIcon('vscode-symbol-event')
    //         default:
    //             return undefined
    //     }
    // }

    private getResourceId(): ResourceTypeId {
        switch (this.type) {
            case SERVERLESS_FUNCTION_TYPE:
                return ResourceTypeId.Function
            case 'Api':
                return ResourceTypeId.Api
            default:
                return ResourceTypeId.Other
        }
    }
}

export function generateResourceNodes(
    app: SamAppLocation,
    resources: NonNullable<ResourceTreeEntity[]>,
    stackName?: string,
    region?: string,
    deployedResources?: StackResource[]
): ResourceNode[] {
    if (!deployedResources) {
        return resources.map((resource) => new ResourceNode(app, resource, stackName, region))
    }

    return resources.map((resource) => {
        if (resource.Type === SERVERLESS_FUNCTION_TYPE) {
            const deployedResource = deployedResources.find(
                (deployedResource) => resource.Id === deployedResource.LogicalResourceId
            )
            return new ResourceNode(app, resource, stackName, region, deployedResource)
        } else {
            return new ResourceNode(app, resource, stackName, region)
        }
    })
}
