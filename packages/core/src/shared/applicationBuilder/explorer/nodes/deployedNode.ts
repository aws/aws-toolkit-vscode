/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIcon } from '../../../icons'
import { TreeNode } from '../../../treeview/resourceTreeDataProvider'
import { generatePropertyNodes } from './propertyNode'
import { ResourceTreeEntity, SamAppLocation } from '../samProject'
import { Lambda } from 'aws-sdk'
import { DefaultLambdaClient } from '../../../clients/lambdaClient'
import { createPlaceholderItem } from '../../../treeview/utils'
import { localize } from 'vscode-nls'
import { getLogger } from '../../../logger/logger'

export class DeployedLambdaNode implements TreeNode {
    public readonly id = this.key
    public readonly resource = this.value
    public readonly functionName = this._functionName

    public constructor(
        private readonly key: string,
        private readonly _functionName: any,
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
        const item = new vscode.TreeItem(this.functionName)

        item.contextValue = 'awsAppBuilderDeployedNode'
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
    deployedResource: any,
    regionCode: any
): Promise<TreeNode[]> {
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

    const functionArn = lambdaFunction.Configuration.FunctionArn
    const functionName = lambdaFunction.Configuration.FunctionName
    return [new DeployedLambdaNode(functionArn, functionName, resource.Id)]
}
