/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { getLogger } from '../logger'
import { AWSTreeNodeBase } from './nodes/awsTreeNodeBase'
import { UnknownError } from '../errors'
import { Logging } from '../logger/commands'
import { TreeNode } from './resourceTreeDataProvider'
import { assign } from '../utilities/collectionUtils'
import { addColor, getIcon } from '../icons'

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
    const command = Logging.declared.viewLogsAtMessage
    const logId = message ? getLogger().error(message) : getLogger().error(error)

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
        treeItem: new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None),
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
export class TreeShim extends AWSTreeNodeBase {
    public constructor(public readonly node: TreeNode) {
        super(node.treeItem.label ?? '[No label]')
        assign(node.treeItem, this)

        this.node.onDidChangeChildren?.(() => this.refresh())
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const children = (await this.node.getChildren?.()) ?? []

        return children.map(n => new TreeShim(n))
    }
}
