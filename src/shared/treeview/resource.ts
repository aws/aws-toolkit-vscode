/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { assign } from '../utilities/collectionUtils'
import { TreeItemContent, TreeNode } from './resourceTreeDataProvider'

export interface Resource {
    /**
     * The identifier associated with the resource.
     *
     * This should be considered _globally_ unique, trancending conventional references. Consumers of
     * the interface can and most likely will treat this identifier as canonical.
     */
    readonly id: string
}

export class ResourceTreeNode<T extends Resource> implements TreeNode<T> {
    public readonly id = this.resource.id
    public readonly treeItem = this.createTreeItem()

    public constructor(public readonly resource: T, private readonly content: TreeItemContent) {}

    private createTreeItem(): vscode.TreeItem {
        const collapsed = vscode.TreeItemCollapsibleState.None
        const item = new vscode.TreeItem(this.content.label, collapsed)

        assign(this.content, item)

        return item
    }
}
