/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getIcon } from '../../../shared/icons'
import { SageMakerUnifiedStudioSpacesParentNode } from './sageMakerUnifiedStudioSpacesParentNode'
import { SageMakerUnifiedStudioProjectNode } from './sageMakerUnifiedStudioProjectNode'
import { SagemakerClient } from '../../../shared/clients/sagemaker'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'

export class SageMakerUnifiedStudioComputeNode implements TreeNode {
    public readonly id = 'smusComputeNode'
    public readonly resource = this
    private spacesNode: SageMakerUnifiedStudioSpacesParentNode | undefined

    constructor(
        public readonly parent: SageMakerUnifiedStudioProjectNode,
        private readonly extensionContext: vscode.ExtensionContext,
        private readonly authprovider: SmusAuthenticationProvider,
        private readonly sagemakerClient: SagemakerClient
    ) {}

    public async getTreeItem(): Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem('Compute', vscode.TreeItemCollapsibleState.Collapsed)
        item.iconPath = getIcon('vscode-chip')
        item.contextValue = this.getContext()
        return item
    }

    public async getChildren(): Promise<TreeNode[]> {
        const childrenNodes: TreeNode[] = []
        const projectId = this.parent.getProject()?.id

        if (projectId) {
            this.spacesNode = new SageMakerUnifiedStudioSpacesParentNode(
                this,
                projectId,
                this.extensionContext,
                this.authprovider,
                this.sagemakerClient
            )
            childrenNodes.push(this.spacesNode)
        }

        return childrenNodes
    }

    public getParent(): TreeNode | undefined {
        return this.parent
    }

    private getContext(): string {
        return 'smusComputeNode'
    }
}
