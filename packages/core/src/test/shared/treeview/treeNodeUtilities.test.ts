/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { compareTreeItems, makeChildrenNodes } from '../../../shared/treeview/utils'
import { assertNodeListOnlyHasErrorNode } from '../../utilities/explorerNodeAssertions'
import { TestAWSTreeNode } from './nodes/testAWSTreeNode'

describe('makeChildrenNodes', async function () {
    const parentNode = new TestAWSTreeNode('parent node')
    const nodeA = new PlaceholderNode(parentNode, 'node A')
    const nodeB = new PlaceholderNode(parentNode, 'node B')

    it('returns child nodes', async function () {
        const childNodes = await makeChildrenNodes({
            getChildNodes: async () => [nodeA, nodeB],
        })

        assert.strictEqual(childNodes.length, 2, 'Unexpected child node count')
        assert.deepStrictEqual(childNodes[0], nodeA, 'Unexpected first child node')
        assert.deepStrictEqual(childNodes[1], nodeB, 'Unexpected second child node')
    })

    it('returns an error node if an error is encountered', async function () {
        const expectedError = new Error('loading error')

        const childNodes = await makeChildrenNodes({
            getChildNodes: async () => {
                throw expectedError
            },
        })

        assertNodeListOnlyHasErrorNode(childNodes)
    })

    it('returns a placeholder node if there are no child nodes', async function () {
        const expectedPlaceholderNode = new PlaceholderNode(parentNode, 'No child nodes found')
        const childNodes = await makeChildrenNodes({
            getChildNodes: async () => [],
            getNoChildrenPlaceholderNode: async () => expectedPlaceholderNode,
        })

        assert.strictEqual(childNodes.length, 1, 'Unexpected child node count')
        const actualChildNode = childNodes[0]
        assert.deepStrictEqual(actualChildNode, expectedPlaceholderNode, 'Child node was not the placeholder node')
    })

    it('returns an empty list if there are no child nodes and no placeholder', async function () {
        const childNodes = await makeChildrenNodes({
            getChildNodes: async () => [],
        })

        assert.strictEqual(childNodes.length, 0, 'Unexpected child node count')
    })

    it('sorts the child nodes', async function () {
        const childNodes = await makeChildrenNodes({
            getChildNodes: async () => [nodeB, nodeA],
            sort: (a, b) => compareTreeItems(a, b),
        })

        assert.strictEqual(childNodes.length, 2, 'Unexpected child node count')
        assert.deepStrictEqual(childNodes[0], nodeA, 'Unexpected first child node')
        assert.deepStrictEqual(childNodes[1], nodeB, 'Unexpected second child node')
    })

    it('does not sort the child nodes if a sort method is not provided', async function () {
        const childNodes = await makeChildrenNodes({
            getChildNodes: async () => [nodeB, nodeA],
        })

        assert.strictEqual(childNodes.length, 2, 'Unexpected child node count')
        assert.deepStrictEqual(childNodes[0], nodeB, 'Unexpected first child node')
        assert.deepStrictEqual(childNodes[1], nodeA, 'Unexpected second child node')
    })
})
