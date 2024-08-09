/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIcon } from '../../../icons'
import { TreeNode } from '../../../treeview/resourceTreeDataProvider'
import { Lambda } from 'aws-sdk'
import { DefaultLambdaClient } from '../../../clients/lambdaClient'
import { createPlaceholderItem } from '../../../treeview/utils'
import { localize } from 'vscode-nls'
import { getLogger } from '../../../logger/logger'
import { ToolkitError } from '../../..'

export interface DeployedResource {
    stackName: string
    regionCode: string
    configuration: Lambda.FunctionConfiguration
}

// TODO:: Add doc strings to all TreeNodes
export class DeployedLambdaNode implements TreeNode<DeployedResource> {
    public readonly id: string

    public constructor(public readonly resource: DeployedResource) {
        if (this.resource.configuration.FunctionName) {
            this.id = this.resource.configuration.FunctionName
        } else {
            throw new ToolkitError('Cannot create DeployedLambdaNode, `FunctionName` does not exist.')
        }
    }

    public async getChildren(): Promise<DeployedLambdaNode[]> {
        return []
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.id)

        item.contextValue = 'awsAppBuilderDeployedNode'
        item.iconPath = getIcon('vscode-cloud')
        item.collapsibleState = vscode.TreeItemCollapsibleState.None
        item.tooltip = this.resource.configuration.FunctionArn
        return item
    }
}

export async function generateDeployedLocalNode(
    deployedResource: any,
    regionCode: string,
    stackName: string
): Promise<any[]> {
    let lambdaFunction: Lambda.GetFunctionResponse | undefined

    try {
        lambdaFunction = await new DefaultLambdaClient(regionCode).getFunction(deployedResource.PhysicalResourceId)
        getLogger().debug('Lambda function details:', lambdaFunction)
    } catch (error: any) {
        getLogger().error('Failed to fetch Lambda function details:', error)
        void vscode.window.showErrorMessage(`Failed to get the deployed function: ${error.message}`)
        return [
            createPlaceholderItem(
                localize('AWS.appBuilder.explorerNode.noApps', '[Function resource is yet to be deployed]')
            ),
        ]
    }

    if (!lambdaFunction || !lambdaFunction.Configuration || !lambdaFunction.Configuration.FunctionArn) {
        getLogger().error('Lambda function details are missing or incomplete:', lambdaFunction)
        return [
            createPlaceholderItem(
                localize('AWS.appBuilder.explorerNode.noApps', '[Function resource is yet to be deployed]')
            ),
        ]
    }
    const _deployedResource: DeployedResource = {
        stackName: stackName,
        regionCode: regionCode,
        configuration: lambdaFunction.Configuration as Lambda.FunctionConfiguration,
    }
    return [new DeployedLambdaNode(_deployedResource)]
}
