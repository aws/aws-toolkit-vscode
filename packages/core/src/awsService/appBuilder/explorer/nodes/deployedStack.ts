/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { getStackName, SamAppLocation } from '../samProject'
import { TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'
import { getLogger } from '../../../../shared/logger/logger'
import { getIcon } from '../../../../shared/icons'

export class StackNameNode implements TreeNode {
    public readonly id = this.stackName
    public readonly resource = this.value

    public constructor(
        public stackName: string,
        public region: string,
        public link: string,
        private location: SamAppLocation
    ) {}

    public async getChildren(): Promise<TreeNode[]> {
        try {
            const { stackName, region } = await getStackName(this.location.samTemplateUri)
            this.stackName = stackName || this.stackName
            this.region = region || this.region
            return [stackName, region]
        } catch (error) {
            getLogger().error(`Failed to get stack name`)
            return []
        }
    }
    public get value(): string {
        return `Current stack: ${this.stackName} (${this.region})`
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.id)

        item.contextValue = 'awsAppBuilderStackNode'
        item.iconPath = getIcon('vscode-cloud')
        item.label = this.value
        return item
    }
}

export class StackNameProvider implements vscode.TreeDataProvider<StackNameNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<StackNameNode | undefined> = new vscode.EventEmitter<
        StackNameNode | undefined
    >()
    readonly onDidChangeTreeData?: vscode.Event<StackNameNode | undefined> = this._onDidChangeTreeData.event
    getChildren(element?: StackNameNode | undefined): vscode.ProviderResult<StackNameNode[]> {
        getLogger().error('StackName Node not implemented properly')
        return []
    }
    refresh(): void {
        this._onDidChangeTreeData.fire(undefined)
    }
    getTreeItem(element: StackNameNode): vscode.TreeItem {
        return element
    }
}
export function generateStackNode(app: SamAppLocation, stackName?: string, region?: string): StackNameNode[] {
    try {
        const link = `command:aws.explorer.cloudformation.showStack?${encodeURIComponent(JSON.stringify({ stackName: stackName, region: region }))}`
        if (stackName === undefined || region === undefined) {
            return []
        }
        return [new StackNameNode(stackName || '', region || '', link, app)]
    } catch (error) {
        getLogger().error(`Failed to generate stack node: ${error}`)
        return []
    }
}
