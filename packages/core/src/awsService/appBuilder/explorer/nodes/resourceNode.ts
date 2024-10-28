/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { IconPath, getIcon } from '../../../../shared/icons'
import { TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'
import { ResourceTreeEntity, SamAppLocation } from '../samProject'
import {
    SERVERLESS_FUNCTION_TYPE,
    s3BucketType,
    appRunnerType,
    ecrRepositoryType,
} from '../../../../shared/cloudformation/cloudformation'
import { generatePropertyNodes } from './propertyNode'
import { generateDeployedNode } from './deployedNode'
import { StackResource } from '../../../../lambda/commands/listSamResources'
import { DeployedResourceNode } from './deployedNode'

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
        private readonly deployedResource?: StackResource,
        // TODO: cleanup or rename functionArn parameter as type can be differ from Lambda; value never set in generateResourceNodes()
        private readonly functionArn?: string
    ) {}

    public get resource() {
        return {
            resource: this.resourceTreeEntity,
            location: this.location.samTemplateUri,
            workspaceFolder: this.location.workspaceFolder,
            region: this.region,
            stackName: this.stackName,
            deployedResource: this.deployedResource,
            functionArn: this.functionArn,
        }
    }

    public async getChildren() {
        let deployedNodes: DeployedResourceNode[] = []
        let propertyNodes: TreeNode[] = []

        if (this.deployedResource && this.region && this.stackName) {
            deployedNodes = await generateDeployedNode(
                this.deployedResource,
                this.region,
                this.stackName,
                this.resourceTreeEntity
            )
        }
        if (this.resourceTreeEntity.Type === SERVERLESS_FUNCTION_TYPE) {
            propertyNodes = generatePropertyNodes(this.resourceTreeEntity)
        }

        return [...propertyNodes, ...deployedNodes]
    }

    public getTreeItem(): vscode.TreeItem {
        // Determine the initial TreeItem collapsible state based on the type
        const collapsibleState = this.deployedResource
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None

        // Create the TreeItem with the determined collapsible state
        const item = new vscode.TreeItem(this.resourceTreeEntity.Id, collapsibleState)

        // Set the tooltip to the URI of the SAM template
        item.tooltip = this.location.samTemplateUri.toString()

        item.iconPath = this.getIconPath()

        // Set the resource URI to the SAM template URI
        item.resourceUri = this.location.samTemplateUri

        // Define the context value for the item
        item.contextValue = `awsAppBuilderResourceNode.${this.getResourceId()}`

        return item
    }

    // Additional resources and corresponding icons will be added in the future.
    // When adding support for new resources, ensure that each new resource
    // has an appropriate mapping in place.
    private getIconPath(): IconPath | undefined {
        switch (this.type) {
            case SERVERLESS_FUNCTION_TYPE:
                return getIcon('aws-lambda-function')
            case s3BucketType:
                return getIcon('aws-s3-bucket')
            case appRunnerType:
                return getIcon('aws-apprunner-service')
            case ecrRepositoryType:
                return getIcon('aws-ecr-registry')
            default:
                return getIcon('vscode-info')
        }
    }

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
        if (resource.Type) {
            const deployedResource = deployedResources.find(
                (deployedResource) => resource.Id === deployedResource.LogicalResourceId
            )
            return new ResourceNode(app, resource, stackName, region, deployedResource)
        } else {
            return new ResourceNode(app, resource, stackName, region)
        }
    })
}
