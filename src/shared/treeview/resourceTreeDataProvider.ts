/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

type ExcludedKeys = 'id' | 'label' | 'collapsibleState'

export interface TreeItemContent extends Omit<vscode.TreeItem, ExcludedKeys> {
    readonly label: string
}

export interface TreeNode<T = unknown> {
    /**
     * A node's ID is only used to maintain uniqueness when multiple referentially
     * equivalent nodes are present within a tree. The ID of a node received by the
     * extension may not be the same as a freshly instantiated node.
     */
    readonly id: string

    /**
     * The underlying model that this node represents.
     */
    readonly resource: T

    /**
     * A tree item used to display the node in a tree view.
     */
    readonly treeItem: vscode.TreeItem // TODO(sijaden): just realized this interface is equivalent to {}, should add 1 required field

    /**
     * Optional event to signal that this node's children has changed.
     */
    readonly onDidChangeChildren?: vscode.Event<void>

    /**
     * Optional method to provide child nodes.
     */
    getChildren?(): Promise<TreeNode[]> | TreeNode[]
}

export function isTreeNode(obj: unknown): obj is TreeNode {
    return (
        !!obj &&
        typeof obj === 'object' &&
        'resource' in obj &&
        typeof (obj as TreeNode).id === 'string' &&
        (obj as TreeNode).treeItem instanceof vscode.TreeItem
    )
}

function copyNode<T>(id: string, node: Omit<TreeNode<T>, 'id'>): TreeNode<T> {
    return {
        id,
        resource: node.resource,
        treeItem: node.treeItem,
        onDidChangeChildren: node.onDidChangeChildren,
        getChildren: node.getChildren?.bind(node),
    }
}

export class ResourceTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
    private readonly children: Map<string, TreeNode[]> = new Map()
    private readonly listeners: Map<string, vscode.Disposable> = new Map()
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | void>()
    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event

    public constructor(private readonly root: Required<Pick<TreeNode, 'getChildren'>>) {}

    public getTreeItem(element: TreeNode): vscode.TreeItem {
        const item = element.treeItem
        item.id = element.id

        return item
    }

    public async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (element) {
            this.children.get(element.id)?.forEach(n => this.clear(n))
        }

        const getId = (id: string) => (element ? `${element.id}/${id}` : id)
        const children = (await (element ?? this.root).getChildren?.()) ?? []
        const tracked = children.map(r => this.insert(getId(r.id), r))
        element && this.children.set(element.id, tracked)

        return tracked
    }

    public refresh(): void {
        vscode.Disposable.from(...this.listeners.values()).dispose()

        this.children.clear()
        this.listeners.clear()
        this.onDidChangeTreeDataEmitter.fire()
    }

    private clear(node: TreeNode): void {
        const children = this.children.get(node.id)

        this.children.delete(node.id)
        this.listeners.get(node.id)?.dispose()
        this.listeners.delete(node.id)

        children?.forEach(c => this.clear(c))
    }

    private insert(id: string, resource: TreeNode): TreeNode {
        const node = copyNode(id, resource)

        if (node.onDidChangeChildren) {
            const listener = node.onDidChangeChildren?.(() => {
                this.children.get(node.id)?.forEach(n => this.clear(n))
                this.onDidChangeTreeDataEmitter.fire(node)
            })

            this.listeners.set(id, listener)
        }

        return node
    }
}
