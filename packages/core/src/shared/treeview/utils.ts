/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { getLogger } from '../logger'
import { AWSTreeNodeBase } from './nodes/awsTreeNodeBase'
import { UnknownError } from '../errors'
import { Logging } from '../logger/commands'
import { isTreeNode, TreeNode } from './resourceTreeDataProvider'
import { assign } from '../utilities/collectionUtils'
import { addColor, getIcon } from '../icons'
import { cast, TypeConstructor } from '../utilities/typeConstructors'

export function getLabel(node: vscode.TreeItem | undefined): string {
    if (typeof node?.label === 'undefined' || typeof node.label === 'string') {
        return node?.label ?? ''
    }
    return node.label.label
}

export function compareTreeItems(nodeA: vscode.TreeItem, nodeB: vscode.TreeItem): number {
    return getLabel(nodeA).localeCompare(getLabel(nodeB))
}

/**
 * Produces a list of child nodes using handlers to consistently populate the
 * list when errors occur or if the list would otherwise be empty.
 */
export async function makeChildrenNodes<T extends AWSTreeNodeBase, P extends AWSTreeNodeBase>(parameters: {
    getChildNodes(): Promise<T[]>
    getNoChildrenPlaceholderNode?(): Promise<P>
    sort?: (a: T, b: T) => number
    getErrorNode?: (error: Error) => AWSTreeNodeBase
}): Promise<T[] | [P] | [AWSTreeNodeBase]> {
    try {
        const nodes = await parameters.getChildNodes()

        if (nodes.length === 0 && parameters.getNoChildrenPlaceholderNode) {
            return [await parameters.getNoChildrenPlaceholderNode()]
        }

        if (parameters.sort) {
            nodes.sort((a, b) => parameters.sort!(a, b))
        }

        return nodes
    } catch (error) {
        const converted = UnknownError.cast(error)

        return [parameters.getErrorNode?.(converted) ?? new TreeShim(createErrorItem(converted))]
    }
}

export function createErrorItem(error: Error, message?: string): TreeNode {
    const command = Logging.instance.viewLogsAtMessage
    const logId = message ? getLogger().error(`${message}: %s`, error) : getLogger().error(error)

    return command.build(logId).asTreeNode({
        label: localize('AWS.explorerNode.error.label', 'Failed to load resources (click for logs)'),
        tooltip: `${error.name}: ${error.message}`,
        iconPath: addColor(getIcon('vscode-error'), 'testing.iconErrored'),
        contextValue: 'awsErrorNode',
    })
}

export function createPlaceholderItem(message: string): TreeNode {
    return {
        id: 'placeholder',
        resource: message,
        getTreeItem: () => new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None),
    }
}

export function unboxTreeNode<T>(node: TreeNode, predicate: (resource: unknown) => resource is T): T {
    if (!predicate(node.resource)) {
        throw new TypeError(`Unexpected tree node resource for node: ${node.id}`)
    }

    return node.resource
}

/**
 * Wrapper that allows a {@link TreeNode} to be used in the legacy explorer.
 *
 * Any new or existing code needs to account for this additional layer as the shim
 * would be passed in as-is.
 */
export class TreeShim<T = unknown> extends AWSTreeNodeBase {
    private children?: AWSTreeNodeBase[]

    public constructor(public readonly node: TreeNode<T>) {
        super('Loading...')
        this.updateTreeItem().catch(e => {
            getLogger().error('TreeShim.updateTreeItem() failed: %s', (e as Error).message)
        })

        this.node.onDidChangeChildren?.(() => {
            this.children = undefined
            this.refresh()
        })

        this.node.onDidChangeTreeItem?.(async () => {
            const { didRefresh } = await this.updateTreeItem()
            !didRefresh && this.refresh()
        })
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        if (this.children) {
            return this.children
        }

        const children = (await this.node.getChildren?.()) ?? []

        return (this.children = children.map(n => new TreeShim(n)))
    }

    private update(item: vscode.TreeItem) {
        // We need to explicitly clear state as `vscode.TreeItem` does not need
        // to have these keys present
        this.label = undefined
        this.command = undefined
        this.tooltip = undefined
        this.iconPath = undefined
        this.description = undefined
        this.contextValue = undefined
        assign(item, this)
    }

    private async updateTreeItem(): Promise<{ readonly didRefresh: boolean }> {
        const item = this.node.getTreeItem()
        if (item instanceof Promise) {
            this.update(await item)
            this.refresh()

            return { didRefresh: true }
        }

        this.update(item)
        return { didRefresh: false }
    }
}

export function getResourceFromTreeNode<T = unknown>(input: unknown, type: TypeConstructor<T>): T {
    if (input instanceof TreeShim) {
        input = input.node
    }

    if (!isTreeNode(input)) {
        throw new TypeError('Input was not a tree node')
    }

    return cast(input.resource, type)
}
