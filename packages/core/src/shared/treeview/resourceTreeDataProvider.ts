/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../errors'

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
     * Optional event to signal that this node's children has changed.
     */
    readonly onDidChangeChildren?: vscode.Event<void>

    /**
     * An optional event to signal that this node's tree item has changed.
     */
    readonly onDidChangeTreeItem?: vscode.Event<void>

    /**
     * Returns a tree item used to display the node in a tree view.
     */
    getTreeItem(): Promise<vscode.TreeItem> | vscode.TreeItem

    /**
     * Optional method to provide child nodes.
     */
    getChildren?(): Promise<TreeNode[]> | TreeNode[]

    /**
     * Optional method to provide parent node.
     */
    getParent?(): TreeNode | undefined
}

export function isTreeNode(obj: unknown): obj is TreeNode {
    return (
        !!obj &&
        typeof obj === 'object' &&
        'resource' in obj &&
        typeof (obj as TreeNode).id === 'string' &&
        typeof (obj as TreeNode).getTreeItem === 'function'
    )
}

function copyNode<T>(id: string, node: Omit<TreeNode<T>, 'id'>): TreeNode<T> {
    return {
        id,
        resource: node.resource,
        onDidChangeChildren: node.onDidChangeChildren,
        onDidChangeTreeItem: node.onDidChangeTreeItem,
        getTreeItem: node.getTreeItem?.bind(node),
        getChildren: node.getChildren?.bind(node),
    }
}

export class ResourceTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
    private readonly items = new Map<string, vscode.TreeItem>()
    private readonly children = new Map<string, TreeNode[]>()
    private readonly listeners = new Map<string, vscode.Disposable>()
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | void>()
    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event

    public constructor(private readonly root: Required<Pick<TreeNode, 'getChildren'>>) {}

    public async getTreeItem(element: TreeNode): Promise<vscode.TreeItem> {
        const previousItem = this.items.get(element.id)
        if (previousItem) {
            return previousItem
        }

        const item = await element.getTreeItem()
        item.id = element.id
        this.items.set(element.id, item)

        return item
    }

    public async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (element) {
            const previousChildren = this.children.get(element.id)

            if (previousChildren !== undefined) {
                return previousChildren
            } else {
                this.children.get(element.id)?.forEach(n => this.clear(n))
            }
        }

        const getId = (id: string) => (element ? `${element.id}/${id}` : id)
        const children = (await (element ?? this.root).getChildren?.()) ?? []
        const tracked = children.map(r => this.insert(getId(r.id), r))
        element && this.children.set(element.id, tracked)

        return tracked
    }

    public getParent(element: TreeNode<unknown>): vscode.ProviderResult<TreeNode> {
        if (!element.getParent) {
            throw new ToolkitError(
                `Node '${element.id}' has not implemented getParent(). This can cause issues with vscode.TreeView.reveal().`
            )
        }
        return element.getParent()
    }

    public refresh(node?: TreeNode): void {
        if (node === undefined) {
            vscode.Disposable.from(...this.listeners.values()).dispose()

            this.items.clear()
            this.children.clear()
            this.listeners.clear()
        } else {
            this.clear(node)
        }

        this.onDidChangeTreeDataEmitter.fire()
    }

    private clear(node: TreeNode): void {
        const children = this.children.get(node.id)

        this.items.delete(node.id)
        this.children.delete(node.id)
        this.listeners.get(node.id)?.dispose()
        this.listeners.delete(node.id)

        children?.forEach(c => this.clear(c))
    }

    private insert(id: string, resource: TreeNode): TreeNode {
        const node = copyNode(id, resource)
        const listeners: vscode.Disposable[] = []

        if (node.onDidChangeChildren) {
            listeners.push(
                node.onDidChangeChildren?.(() => {
                    this.children.get(node.id)?.forEach(n => this.clear(n))
                    this.children.delete(node.id)
                    this.onDidChangeTreeDataEmitter.fire(node)
                })
            )
        }

        if (node.onDidChangeTreeItem) {
            listeners.push(
                node.onDidChangeTreeItem?.(() => {
                    this.items.delete(node.id)
                    this.onDidChangeTreeDataEmitter.fire(node)
                })
            )
        }

        if (listeners.length !== 0) {
            this.listeners.set(id, vscode.Disposable.from(...listeners))
        }

        return node
    }
}
