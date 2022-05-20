/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EventEmitter, TreeItem } from 'vscode'
import { ResourceTreeDataProvider, TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'

interface Tree {
    readonly [id: string]: Tree
}

class TestNode implements TreeNode<TestNode> {
    private readonly onDidChangeChildrenEmitter = new EventEmitter<void>()

    public readonly resource = this
    public readonly treeItem = new TreeItem(this.id)
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event

    public constructor(public readonly id: string, private readonly tree: Tree) {}

    public refresh() {
        this.onDidChangeChildrenEmitter.fire()
    }

    public getChildren() {
        return buildTree(this.tree)
    }
}

function buildTree(tree: Tree): TestNode[] {
    return Object.entries(tree).map(([k, v]) => new TestNode(k, v))
}

function getRoot(tree: Tree) {
    return { getChildren: () => buildTree(tree) }
}

function getLabels(nodes: TreeNode[]): string[] {
    return nodes.map(n => n.treeItem.label ?? 'not set')
}

function intoTestNode(node: TreeNode): TestNode | never {
    if (!(node.resource instanceof TestNode)) {
        throw new TypeError(`Node "${node.id}" had an incorrect resource: ${node.resource}`)
    }

    return node.resource
}

function setupChanged(provider: ResourceTreeDataProvider): TreeNode[] {
    const changed: TreeNode[] = []
    provider.onDidChangeTreeData(node => node && changed.push(node))

    return changed
}

describe('ResourceTreeDataProvider', function () {
    const flatTree = { node0: {}, node1: {}, node2: {} }

    it('lists children from a root node', async function () {
        const provider = new ResourceTreeDataProvider(getRoot(flatTree))
        const children = await provider.getChildren()

        assert.deepStrictEqual(getLabels(children), ['node0', 'node1', 'node2'])
    })

    it('can refresh the provider', async function () {
        const provider = new ResourceTreeDataProvider(getRoot(flatTree))
        const changed = setupChanged(provider)

        const nodes = (await provider.getChildren()).map(intoTestNode)
        nodes[0].refresh()
        nodes[1].refresh()
        provider.refresh()
        nodes[2].refresh()

        assert.deepStrictEqual(getLabels(changed), ['node0', 'node1'])
    })

    describe('nested', function () {
        const nested = { nested: flatTree }

        it('can list children from an element', async function () {
            const provider = new ResourceTreeDataProvider(getRoot(nested))
            const children1 = await provider.getChildren()
            const children2 = await provider.getChildren(children1[0])

            assert.deepStrictEqual(getLabels(children1), ['nested'])
            assert.deepStrictEqual(getLabels(children2), ['node0', 'node1', 'node2'])
        })

        it('can get a tree item with a unique id', async function () {
            const provider = new ResourceTreeDataProvider(getRoot(nested))
            const children = await provider.getChildren((await provider.getChildren())[0])
            const item = provider.getTreeItem(children[0])

            assert.strictEqual(item.id, 'nested/node0')
            assert.strictEqual(item.label, 'node0')
        })

        it('clears nested event listeners', async function () {
            const provider = new ResourceTreeDataProvider(getRoot(nested))
            const changed = setupChanged(provider)

            const children1 = await provider.getChildren()
            const children2 = await provider.getChildren(children1[0])

            const nodes1 = children1.map(intoTestNode)
            const nodes2 = children2.map(intoTestNode)

            nodes2[0].refresh()
            nodes2[1].refresh()
            nodes1[0].refresh()
            nodes2[0].refresh()

            assert.deepStrictEqual(getLabels(changed), ['node0', 'node1', 'nested'])
        })
    })
})
