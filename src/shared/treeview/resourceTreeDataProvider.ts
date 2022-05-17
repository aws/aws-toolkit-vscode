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
    readonly id: string
    readonly resource: T
    readonly treeItem: vscode.TreeItem
    readonly onDidChangeChildren?: vscode.Event<void>
    getChildren?(): Promise<TreeNode[]> | TreeNode[]
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
    private readonly nodes: Map<string, TreeNode[]> = new Map()
    private readonly listeners: Map<string, vscode.Disposable[]> = new Map()
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | void>()
    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event

    public constructor(private readonly root: Required<Pick<TreeNode, 'getChildren'>>) {}

    public getTreeItem(element: TreeNode): vscode.TreeItem {
        const item = element.treeItem
        item.id = element.id

        return item
    }

    public async getChildren(element?: TreeNode): Promise<TreeNode[] | undefined> {
        const getId = (id: string) => (element ? `${element.id}-${id}` : id)
        const children = (await (element ?? this.root).getChildren?.()) ?? []

        return children.map(r => this.intoNode(getId(r.id), r))
    }

    public refresh(): void {
        for (const l of this.listeners.values()) {
            vscode.Disposable.from(...l).dispose()
        }

        this.nodes.clear()
        this.listeners.clear()
        this.onDidChangeTreeDataEmitter.fire()
    }

    private insert(id: string, node: TreeNode): typeof node {
        const nodes = this.nodes.get(id) ?? []
        this.nodes.set(id, [...nodes, node])

        if (node.onDidChangeChildren) {
            const listeners = this.listeners.get(id) ?? []
            const listener = node.onDidChangeChildren?.(() => {
                this.clear(node)
                this.onDidChangeTreeDataEmitter.fire(node)
            })

            this.listeners.set(id, [...listeners, listener])
        }

        return node
    }

    private clear(node: TreeNode): void {
        for (const id of Array.from(this.nodes.keys()).filter(k => k.startsWith(node.id))) {
            vscode.Disposable.from(...(this.listeners.get(id) ?? [])).dispose()
            this.nodes.delete(id)
            this.listeners.delete(id)
        }
    }

    private intoNode(id: string, resource: TreeNode): TreeNode {
        const previous = this.nodes.get(resource.id)?.find(n => n.id === id)

        if (previous) {
            return previous
        }

        return this.insert(resource.id, copyNode(id, resource))
    }
}
