/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'
import { getIcon } from '../../../../shared/icons'
import { CloudFormationClient, DescribeStacksCommand, CloudFormationClientConfig } from '@aws-sdk/client-cloudformation'
import { ToolkitError } from '../../../../shared/errors'
import { getIAMConnection } from '../../../../auth/utils'
import globals from '../../../../shared/extensionGlobals'

export class StackNameNode implements TreeNode {
    public readonly id = this.stackName
    public readonly resource = this
    public arn: string | undefined
    public readonly link = `command:aws.explorer.cloudformation.showStack?${encodeURIComponent(JSON.stringify({ stackName: this.stackName, region: this.regionCode }))}`

    public constructor(
        public stackName: string,
        public regionCode: string
    ) {
        this.stackName = stackName
        this.regionCode = regionCode
    }

    public async getChildren(): Promise<TreeNode[]> {
        // This stack name node is a leaf node that does not have any children.
        return []
    }
    public get value(): string {
        return `Stack: ${this.stackName} (${this.regionCode})`
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.value)

        item.contextValue = 'awsAppBuilderStackNode'
        item.iconPath = getIcon('vscode-cloud')
        return item
    }
}

export async function generateStackNode(stackName?: string, regionCode?: string): Promise<StackNameNode[]> {
    const connection = await getIAMConnection({ prompt: false })
    if (!connection || connection.type !== 'iam') {
        return []
    }
    const cred = await connection.getCredentials()
    const endpointUrl = globals.awsContext.getCredentialEndpointUrl()
    const opts: CloudFormationClientConfig = { region: regionCode, credentials: cred }
    if (endpointUrl !== undefined) {
        opts.endpoint = endpointUrl
    }
    const client = new CloudFormationClient(opts)
    try {
        const command = new DescribeStacksCommand({ StackName: stackName })
        const response = await client.send(command)
        if (response.Stacks && response.Stacks[0]) {
            const stackArn = response.Stacks[0].StackId
            if (stackName === undefined || regionCode === undefined) {
                return []
            }
            const stackNode = new StackNameNode(stackName || '', regionCode || '')
            stackNode.arn = stackArn
            return [stackNode]
        }
    } catch (error) {
        throw new ToolkitError(`Failed to generate stack node ${stackName} in region ${regionCode}: ${error}`)
    }
    return []
}
