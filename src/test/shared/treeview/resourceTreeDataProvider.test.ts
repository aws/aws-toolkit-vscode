/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { EventEmitter, TreeItem } from 'vscode'
import { ResourceTreeDataProvider, TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { stringOrProp } from '../../../shared/utilities/tsUtils'

interface Tree {
    readonly [id: string]: Tree
}

class TestNode implements TreeNode<TestNode> {
    private readonly onDidChangeChildrenEmitter = new EventEmitter<void>()
    private readonly onDidChangeTreeItemEmitter = new EventEmitter<void>()

    public readonly resource = this
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event
    public readonly onDidChangeTreeItem = this.onDidChangeTreeItemEmitter.event

    public constructor(public readonly id: string, private readonly tree: Tree) {}

    public refreshChildren() {
        this.onDidChangeChildrenEmitter.fire()
    }

    public refreshTreeItem() {
        this.onDidChangeTreeItemEmitter.fire()
    }

    public getTreeItem() {
        return new TreeItem(this.id)
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

function getLabels(nodes: TreeNode[]): Promise<string[]> {
    return Promise.all(nodes.map(async n => stringOrProp((await n.getTreeItem()).label, 'label') ?? 'not set'))
}

function toTestNode(node: TreeNode): TestNode | never {
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

function assertNotCached(newItem: TreeItem, oldItem: TreeItem): void {
    assert.notStrictEqual(newItem, oldItem)
    assert.deepStrictEqual(newItem, oldItem)
}

describe('ResourceTreeDataProvider', function () {
    const tree = { node0: { node1: {} } }
    const flatTree = { node0: {}, node1: {}, node2: {} }

    it('lists children from a root node', async function () {
        const provider = new ResourceTreeDataProvider(getRoot(flatTree))
        const children = await provider.getChildren()

        assert.deepStrictEqual(await getLabels(children), ['node0', 'node1', 'node2'])
    })

    it('can refresh the provider', async function () {
        const provider = new ResourceTreeDataProvider(getRoot(flatTree))
        const changed = setupChanged(provider)

        const nodes = (await provider.getChildren()).map(toTestNode)
        nodes[0].refreshChildren()
        nodes[1].refreshChildren()
        provider.refresh()
        nodes[2].refreshChildren()

        assert.deepStrictEqual(await getLabels(changed), ['node0', 'node1'])
    })

    it('clears tree items on refresh', async function () {
        const provider = new ResourceTreeDataProvider(getRoot(tree))
        const [node0] = await provider.getChildren()
        const item0 = await provider.getTreeItem(node0)
        provider.refresh()

        const newItem0 = await provider.getTreeItem(node0)
        assertNotCached(newItem0, item0)
    })

    it('can refresh a node independently of the rest of the tree', async function () {
        const provider = new ResourceTreeDataProvider(getRoot(flatTree))
        const [node0, node1] = await provider.getChildren()
        const item0 = await provider.getTreeItem(node0)
        const item1 = await provider.getTreeItem(node1)
        provider.refresh(node1)

        const newItem0 = await provider.getTreeItem(node0)
        const newItem1 = await provider.getTreeItem(node1)
        assert.strictEqual(newItem0, item0)
        assertNotCached(newItem1, item1)
    })

    it("caches children, clearing the cache when a node's children change", async function () {
        const provider = new ResourceTreeDataProvider(getRoot(tree))
        const [node0] = await provider.getChildren()
        const children = await provider.getChildren(node0)

        assert.strictEqual(await provider.getChildren(node0), children)
        toTestNode(node0).refreshChildren()
        assert.notStrictEqual(await provider.getChildren(node0), children)
    })

    it("caches tree items, clearing the cache when a node's tree item changes", async function () {
        const provider = new ResourceTreeDataProvider(getRoot(tree))
        const [node0] = await provider.getChildren()
        const treeItem = await provider.getTreeItem(node0)

        assert.strictEqual(await provider.getTreeItem(node0), treeItem)
        toTestNode(node0).refreshTreeItem()
        assertNotCached(await provider.getTreeItem(node0), treeItem)
    })

    it('preserves event listeners of cached children after tree item changes', async function () {
        const provider = new ResourceTreeDataProvider(getRoot(tree))
        const [node0] = await provider.getChildren()
        await provider.getChildren(node0)
        toTestNode(node0).refreshTreeItem()

        const [node1] = await provider.getChildren(node0)
        const changed = setupChanged(provider)
        toTestNode(node1).refreshTreeItem()
        assert.deepStrictEqual(await getLabels(changed), ['node1'])
    })

    describe('nested tree', function () {
        const nestedTree = { nested: flatTree }

        it('can list children from an element', async function () {
            const provider = new ResourceTreeDataProvider(getRoot(nestedTree))
            const children1 = await provider.getChildren()
            const children2 = await provider.getChildren(children1[0])

            assert.deepStrictEqual(await getLabels(children1), ['nested'])
            assert.deepStrictEqual(await getLabels(children2), ['node0', 'node1', 'node2'])
        })

        it('can get a tree item with a unique id', async function () {
            const provider = new ResourceTreeDataProvider(getRoot(nestedTree))
            const children = await provider.getChildren((await provider.getChildren())[0])
            const item = await provider.getTreeItem(children[0])

            assert.strictEqual(item.id, 'nested/node0')
            assert.strictEqual(item.label, 'node0')
        })

        it('clears nested event listeners', async function () {
            const provider = new ResourceTreeDataProvider(getRoot(nestedTree))
            const changed = setupChanged(provider)

            const children1 = await provider.getChildren()
            const children2 = await provider.getChildren(children1[0])

            const nodes1 = children1.map(toTestNode)
            const nodes2 = children2.map(toTestNode)

            nodes2[0].refreshChildren()
            nodes2[1].refreshChildren()
            nodes1[0].refreshChildren()
            nodes2[0].refreshChildren()

            assert.deepStrictEqual(await getLabels(changed), ['node0', 'node1', 'nested'])
        })

        it('can refresh only the tree item, preserving the children', async function () {
            const provider = new ResourceTreeDataProvider(getRoot(nestedTree))
            const changed = setupChanged(provider)

            const [nested] = await provider.getChildren()
            const testNode = toTestNode(nested)
            const children = await provider.getChildren(nested)
            testNode.refreshTreeItem()

            assert.deepStrictEqual(await getLabels(changed), ['nested'])
            assert.strictEqual(children, await provider.getChildren(nested))
        })

        it('does not cache nested tree items if the parent node changes children', async function () {
            const provider = new ResourceTreeDataProvider(getRoot(tree))
            const [node0] = await provider.getChildren()
            const [node1] = await provider.getChildren(node0)

            const item1 = await provider.getTreeItem(node1)
            assert.strictEqual(await provider.getTreeItem(node1), item1)
            toTestNode(node0).refreshChildren()
            assertNotCached(await provider.getTreeItem(node1), item1)
        })
    })
})
