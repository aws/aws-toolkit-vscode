/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIcon } from '../../../../shared/icons'
import { TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'
import { generatePropertyNodes } from './propertyNode'
import { ResourceTreeEntity, SamAppLocation } from '../samProject'
import { Lambda } from 'aws-sdk'
import { DefaultLambdaClient } from '../../../../shared/clients/lambdaClient'
import { createPlaceholderItem } from '../../../../shared/treeview/utils'
import { localize } from 'vscode-nls'

export class DeployedLambdaNode implements TreeNode {
    public readonly id = this.key
    public readonly resource = this.value
    public constructor(
        private readonly key: string,
        private readonly value: unknown
    ) {}

    public async getChildren(): Promise<TreeNode[]> {
        if (this.value instanceof Array || this.value instanceof Object) {
            return generatePropertyNodes(this.value)
        } else {
            return []
        }
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.key)

        item.contextValue = 'awsApplicationBuilderDeployedNode'
        item.iconPath = getIcon('vscode-cloud')

        if (this.value instanceof Array || this.value instanceof Object) {
            item.label = this.key
            item.collapsibleState = vscode.TreeItemCollapsibleState.None
        }

        return item
    }
}

export async function generateDeployedLocalNode(
    app: SamAppLocation,
    resource: ResourceTreeEntity,
    deployedResource: any
): Promise<TreeNode[]> {
    let lambdaFunction: Lambda.GetFunctionResponse | undefined

    try {
        lambdaFunction = await new DefaultLambdaClient('us-west-2').getFunction(deployedResource.PhysicalResourceId)
        console.log('Lambda function details:', lambdaFunction)
    } catch (error: any) {
        console.error('Failed to fetch Lambda function details:', error)
        void vscode.window.showErrorMessage(`Failed to get the deployed function: ${error.message}`)
        return [
            createPlaceholderItem(
                localize('AWS.applicationBuilder.explorerNode.noApps', '[Function resource is yet to be deployed]')
            ),
        ]
    }

    if (!lambdaFunction || !lambdaFunction.Configuration || !lambdaFunction.Configuration.FunctionArn) {
        console.error('Lambda function details are missing or incomplete:', lambdaFunction)
        return [
            createPlaceholderItem(
                localize('AWS.applicationBuilder.explorerNode.noApps', '[Function resource is yet to be deployed]')
            ),
        ]
    }

    const functionArn = lambdaFunction.Configuration.FunctionArn
    return [new DeployedLambdaNode(functionArn, resource.Id)]
}
