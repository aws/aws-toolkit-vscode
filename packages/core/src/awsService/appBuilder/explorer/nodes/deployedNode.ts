/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIcon } from '../../../../shared/icons'
import { TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'
import { createPlaceholderItem } from '../../../../shared/treeview/utils'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { getLogger } from '../../../../shared/logger/logger'
import { FunctionConfiguration, LambdaClient, GetFunctionCommand } from '@aws-sdk/client-lambda'
import { DefaultLambdaClient } from '../../../../shared/clients/lambdaClient'
import globals from '../../../../shared/extensionGlobals'
import { defaultPartition } from '../../../../shared/regions/regionProvider'
import { Lambda, APIGateway } from 'aws-sdk'
import { LambdaNode } from '../../../../lambda/explorer/lambdaNodes'
import { LambdaFunctionNode } from '../../../../lambda/explorer/lambdaFunctionNode'
import { DefaultS3Client, DefaultBucket } from '../../../../shared/clients/s3Client'
import { S3Node } from '../../../../awsService/s3/explorer/s3Nodes'
import { S3BucketNode } from '../../../../awsService/s3/explorer/s3BucketNode'
import { ApiGatewayNode } from '../../../../awsService/apigateway/explorer/apiGatewayNodes'
import { RestApiNode } from '../../../../awsService/apigateway/explorer/apiNodes'
import {
    SERVERLESS_FUNCTION_TYPE,
    SERVERLESS_API_TYPE,
    s3BucketType,
} from '../../../../shared/cloudformation/cloudformation'

export interface DeployedResource {
    stackName: string
    regionCode: string
    explorerNode: any
    arn: string
    contextValue: string
}

export class DeployedResourceNode implements TreeNode<DeployedResource> {
    public readonly id: string
    public readonly contextValue: string

    public constructor(public readonly resource: DeployedResource) {
        if (this.resource.arn) {
            this.id = this.resource.arn
            this.contextValue = this.resource.contextValue
        } else {
            getLogger().warn('Cannot create DeployedResourceNode, the ARN does not exist.')
            this.id = ''
            this.contextValue = ''
        }
    }

    public async getChildren(): Promise<DeployedResourceNode[]> {
        return []
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.id)

        item.contextValue = this.contextValue
        item.iconPath = getIcon('vscode-cloud')
        item.collapsibleState = vscode.TreeItemCollapsibleState.None
        item.tooltip = this.resource.arn
        return item
    }
}

export async function generateDeployedNode(
    deployedResource: any,
    regionCode: string,
    stackName: string,
    resourceTreeEntity: any
): Promise<any[]> {
    let newDeployedResource: any
    const partitionId = globals.regionProvider.getPartitionId(regionCode) ?? defaultPartition
    switch (resourceTreeEntity.Type) {
        case SERVERLESS_FUNCTION_TYPE: {
            const defaultClient = new DefaultLambdaClient(regionCode)
            const lambdaNode = new LambdaNode(regionCode, defaultClient)
            let configuration: Lambda.FunctionConfiguration
            let v3configuration
            let logGroupName
            try {
                configuration = (await defaultClient.getFunction(deployedResource.PhysicalResourceId))
                    .Configuration as Lambda.FunctionConfiguration
                newDeployedResource = new LambdaFunctionNode(lambdaNode, regionCode, configuration)
            } catch {
                getLogger().error('Error getting Lambda configuration')
            }
            const v3Client = new LambdaClient({ region: regionCode })
            const v3command = new GetFunctionCommand({ FunctionName: deployedResource.PhysicalResourceId })
            try {
                v3configuration = (await v3Client.send(v3command)).Configuration as FunctionConfiguration
                logGroupName = v3configuration.LoggingConfig?.LogGroup
            } catch {
                getLogger().error('Error getting Lambda V3 configuration')
            }
            newDeployedResource.contextValue = 'awsRegionFunctionNodeDownloadable'
            newDeployedResource.configuration = {
                ...newDeployedResource.configuration,
                logGroupName: logGroupName,
            } as any
            break
        }
        case s3BucketType: {
            const s3Client = new DefaultS3Client(regionCode)
            const s3Node = new S3Node(s3Client)
            const s3Bucket = new DefaultBucket({
                partitionId: partitionId,
                region: regionCode,
                name: deployedResource.PhysicalResourceId,
            })
            newDeployedResource = new S3BucketNode(s3Bucket, s3Node, s3Client)
            newDeployedResource.contextValue = 'awsS3BucketNode'
            break
        }
        case SERVERLESS_API_TYPE: {
            const apiParentNode = new ApiGatewayNode(partitionId, regionCode)
            const apiNodes = await apiParentNode.getChildren()
            const apiNode = apiNodes.find((node) => node.id === deployedResource.PhysicalResourceId)
            newDeployedResource = new RestApiNode(apiParentNode, partitionId, regionCode, apiNode as APIGateway.RestApi)
            newDeployedResource.contextValue = 'awsApiGatewayNode'
            break
        }
        default:
            newDeployedResource = new DeployedResourceNode(deployedResource)
            getLogger().info('Details are missing or are incomplete for:', deployedResource)
            return [
                createPlaceholderItem(
                    localize('AWS.appBuilder.explorerNode.noApps', '[This resource is not yet supported.]')
                ),
            ]
    }
    const finalDeployedResource = {
        stackName,
        regionCode,
        explorerNode: newDeployedResource,
        arn: newDeployedResource.arn,
        contextValue: newDeployedResource.contextValue,
    }
    return [new DeployedResourceNode(finalDeployedResource)]
}
