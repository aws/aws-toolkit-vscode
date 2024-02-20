/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import { selectFrom, keys } from '../../../shared/utilities/tsUtils'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'

type Nodeable = { toTreeNode: () => TreeNode }
type Node = TreeNode | Nodeable
type Matcher = string | { [P in keyof vscode.TreeItem]: vscode.TreeItem[P] }

const resolveNode = (node: Node) =>
    (node as Nodeable).toTreeNode !== undefined ? (node as Nodeable).toTreeNode() : (node as TreeNode)

const applyMatcher = (item: vscode.TreeItem, matcher: Matcher | undefined) =>
    !!matcher && typeof matcher !== 'string' ? selectFrom(item, ...keys(matcher)) : item.label

/**
 * Checks if the explorer tree node produces an item that matches the expected properties.
 *
 * Only fields specified will be checked. Everything else on the item is ignored.
 */
export async function assertTreeItem(model: Node, expected: Exclude<Matcher, string>): Promise<void | never> {
    const item = await resolveNode(model).getTreeItem()
    assert.deepStrictEqual(applyMatcher(item, expected), expected)
}

/**
 * Checks if the explorer tree node produces the expected children.
 *
 * Children can be matched either by their label or by an object of expected properties.
 */
export async function assertChildren(model: Node, ...expected: Matcher[]): Promise<void | never> {
    const children = await resolveNode(model).getChildren?.()
    assert.ok(children, 'Expected tree node to have children')

    const items = await Promise.all(children.map(child => child.getTreeItem()))
    const matched = items.map((item, i) => applyMatcher(item, expected[i]))
    assert.deepStrictEqual(matched, expected)
}
