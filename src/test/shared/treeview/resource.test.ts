/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { TreeItem, Command, TreeItemCollapsibleState } from 'vscode'
import { loadMoreCommand, ResourceTreeNode } from '../../../shared/treeview/resource'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { toCollection } from '../../../shared/utilities/asyncCollection'

type Replace<T, K extends keyof T, U> = Omit<T, K> & { [P in K]: U }
type BoundCommand<T extends any[]> = Replace<Command, 'arguments', T>
type LoadMoreBoundCommand = BoundCommand<Parameters<typeof loadMoreCommand['execute']>>
type LoadMoreNode = Replace<TreeNode, 'getTreeItem', () => Replace<TreeItem, 'command', LoadMoreBoundCommand>>
function isLoadMoreNode(node: TreeNode): node is LoadMoreNode {
    return (node.resource as any).id === loadMoreCommand.id
}

async function* runLoadMore(node: TreeNode) {
    while (true) {
        const children = await node.getChildren?.()
        yield children ?? []

        const loadMoreNode = children?.find(isLoadMoreNode)
        if (loadMoreNode === undefined) {
            break
        }

        const treeItem = loadMoreNode.getTreeItem()
        const args = treeItem.command.arguments
        await loadMoreCommand.execute(...args)
    }
}

describe('ResourceTreeNode', function () {
    const createResource = (id: string) => ({ id, getTreeItem: () => new TreeItem(''), resource: {} })

    it('uses a non-collapsible tree item if no children are provided', async function () {
        const node = new ResourceTreeNode(createResource('foo'))
        const item = await node.getTreeItem()

        assert.strictEqual(item.collapsibleState, TreeItemCollapsibleState.None)
    })

    describe('placeholders', function () {
        it('can use a custom placeholder message', async function () {
            const node = new ResourceTreeNode(createResource('foo'), {
                placeholder: 'nothing found',
                childrenProvider: { listResources: () => [] },
            })

            const children = await node.getChildren()
            assert.strictEqual(children.length, 1)

            const treeItem = await children[0].getTreeItem()
            assert.strictEqual(treeItem.label, 'nothing found')
        })

        it('can use a custom placeholder node', async function () {
            const placeholder = createResource('my-placeholder')
            const node = new ResourceTreeNode(createResource('foo'), {
                placeholder,
                childrenProvider: { listResources: () => [] },
            })

            const children = await node.getChildren()
            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0], placeholder)
        })
    })

    describe('pagination', function () {
        it('uses a load more node to load pages', async function () {
            const node = new ResourceTreeNode(createResource('foo'), {
                childrenProvider: {
                    paginated: true,
                    listResources: () =>
                        toCollection(async function* () {
                            yield [createResource('1')]
                            return [createResource('2')]
                        }),
                },
            })

            const states = await toCollection(runLoadMore.bind(undefined, node)).promise()
            assert.strictEqual(states.length, 2)
            assert.strictEqual(states[0].length, 2)
            assert.strictEqual(states[0][0].id, '1')
            assert.ok(isLoadMoreNode(states[0][1]))

            assert.strictEqual(states[1].length, 2)
            assert.strictEqual(states[1][0].id, '1')
            assert.strictEqual(states[1][1].id, '2')
        })
    })

    describe('errors', function () {
        it('uses an error node when failing to get children', async function () {
            const node = new ResourceTreeNode(
                { id: 'foo', getTreeItem: () => new TreeItem('') },
                {
                    childrenProvider: {
                        listResources: () => {
                            throw new Error()
                        },
                    },
                }
            )

            const children = await node.getChildren()
            const firstItem = await children[0]?.getTreeItem()
            assert.ok(firstItem?.contextValue, 'awsErrorNode')
        })

        it('uses an error node when failing to get paginated children', async function () {
            const node = new ResourceTreeNode(
                { id: 'foo', getTreeItem: () => new TreeItem('') },
                {
                    childrenProvider: {
                        paginated: true,
                        listResources: () =>
                            toCollection(async function* () {
                                throw new Error()
                                yield []
                            }),
                    },
                }
            )

            const children = await node.getChildren()
            const firstItem = await children[0]?.getTreeItem()
            assert.ok(firstItem?.contextValue, 'awsErrorNode')
        })
    })
})
