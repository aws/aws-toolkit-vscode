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

export interface ResourceProvider<T extends Resource = Resource> {
    listResources(): Promise<T[]> | T[]
    readonly onDidChange?: vscode.Event<void>
}

export class ResourceTreeNode<T extends Resource> implements TreeNode<T> {
    public readonly id = this.resource.id

    public constructor(
        public readonly resource: T,
        private readonly content: TreeItemContent,
        private readonly children?: ResourceProvider<TreeNode>
    ) {}

    public get onDidChangeChildren() {
        return this.children?.onDidChange
    }

    public getChildren(): Promise<TreeNode[]> | TreeNode[] {
        return this.children?.listResources() ?? []
    }

    public getTreeItem(): vscode.TreeItem {
        const collapsed =
            this.children !== undefined
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None

        const item = new vscode.TreeItem(this.content.label, collapsed)
        assign(this.content, item)

        return item
    }
}
