/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'
import { getIcon } from '../../../../shared/icons'

export class StackNameNode implements TreeNode {
    public readonly id = this.stackName
    public readonly resource = this.value
    public readonly link = `command:aws.explorer.cloudformation.showStack?${encodeURIComponent(JSON.stringify({ stackName: this.stackName, region: this.region }))}`

    public constructor(
        public stackName: string,
        public region: string
    ) {
        this.stackName = stackName
        this.region = region
    }

    public async getChildren(): Promise<TreeNode[]> {
        // This stack name node is a leaf node that does not have any children.
        return []
    }
    public get value(): string {
        return `Stack: ${this.stackName} (${this.region})`
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.value)

        item.contextValue = 'awsAppBuilderStackNode'
        item.iconPath = getIcon('vscode-cloud')
        return item
    }
}
