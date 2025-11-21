/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SageMakerUnifiedStudioComputeNode } from './sageMakerUnifiedStudioComputeNode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { ListConnectionsCommandOutput, ConnectionType } from '@aws-sdk/client-datazone'
import { SageMakerUnifiedStudioConnectionNode } from './sageMakerUnifiedStudioConnectionNode'
import { createDZClientBaseOnDomainMode } from './utils'

// eslint-disable-next-line id-length
export class SageMakerUnifiedStudioConnectionParentNode implements TreeNode {
    public resource: SageMakerUnifiedStudioConnectionParentNode
    contextValue: string
    public connections: ListConnectionsCommandOutput | undefined
    public constructor(
        private readonly parent: SageMakerUnifiedStudioComputeNode,
        private readonly connectionType: ConnectionType,
        public id: string
    ) {
        this.resource = this
        this.contextValue = this.getContext()
    }

    public async getTreeItem(): Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem(this.id, vscode.TreeItemCollapsibleState.Collapsed)
        item.contextValue = this.getContext()
        return item
    }

    public async getChildren(): Promise<TreeNode[]> {
        const client = await createDZClientBaseOnDomainMode(this.parent.authProvider)
        this.connections = await client.fetchConnections(
            this.parent.parent.project?.domainId,
            this.parent.parent.project?.id,
            this.connectionType
        )
        const childrenNodes = []
        if (!this.connections?.items || this.connections.items.length === 0) {
            return [
                {
                    id: 'smusNoConnections',
                    resource: {},
                    getTreeItem: () =>
                        new vscode.TreeItem('[No connections found]', vscode.TreeItemCollapsibleState.None),
                    getParent: () => this,
                },
            ]
        }
        for (const connection of this.connections.items) {
            childrenNodes.push(new SageMakerUnifiedStudioConnectionNode(this, connection))
        }
        return childrenNodes
    }

    private getContext(): string {
        return 'SageMakerUnifiedStudioConnectionParentNode'
    }

    public getParent(): TreeNode | undefined {
        return this.parent
    }
}
