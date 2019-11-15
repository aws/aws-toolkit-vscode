/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ErrorNode } from '../../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../../shared/treeview/treeNodeUtilities'
import { TestAWSTreeNode } from './nodes/testAWSTreeNode'

describe('makeChildrenNodes', async () => {
    const parentNode = new TestAWSTreeNode('parent node')
    const nodeA = new PlaceholderNode(parentNode, 'node A')
    const nodeB = new PlaceholderNode(parentNode, 'node B')

    it('returns child nodes', async () => {
        const childNodes = await makeChildrenNodes({
            getChildNodes: async () => [nodeA, nodeB],
            getErrorNode: async (error: Error) => makeErrorNode(error)
        })

        assert.strictEqual(childNodes.length, 2, 'Unexpected child node count')
        assert.deepStrictEqual(childNodes[0], nodeA, 'Unexpected first child node')
        assert.deepStrictEqual(childNodes[1], nodeB, 'Unexpected second child node')
    })

    it('returns an error node if an error is encountered', async () => {
        const expectedError = new Error('loading error')
        const expectedErrorNode = makeErrorNode(expectedError)

        const childNodes = await makeChildrenNodes({
            getChildNodes: async () => {
                throw expectedError
            },
            getErrorNode: async (error: Error) => expectedErrorNode
        })

        assert.strictEqual(childNodes.length, 1, 'Unexpected child node count')
        const actualChildNode = childNodes[0]
        assert.deepStrictEqual(actualChildNode, expectedErrorNode, 'Child node was not the error node')
    })

    it('returns a placeholder node if there are no child nodes', async () => {
        const expectedPlaceholderNode = new PlaceholderNode(parentNode, 'No child nodes found')
        const childNodes = await makeChildrenNodes({
            getChildNodes: async () => [],
            getErrorNode: async (error: Error) => makeErrorNode(error),
            getNoChildrenPlaceholderNode: async () => expectedPlaceholderNode
        })

        assert.strictEqual(childNodes.length, 1, 'Unexpected child node count')
        const actualChildNode = childNodes[0]
        assert.deepStrictEqual(actualChildNode, expectedPlaceholderNode, 'Child node was not the placeholder node')
    })

    it('returns an empty list if there are no child nodes and no placeholder', async () => {
        const childNodes = await makeChildrenNodes({
            getChildNodes: async () => [],
            getErrorNode: async (error: Error) => makeErrorNode(error)
        })

        assert.strictEqual(childNodes.length, 0, 'Unexpected child node count')
    })

    it('sorts the child nodes', async () => {
        const childNodes = await makeChildrenNodes({
            getChildNodes: async () => [nodeB, nodeA],
            getErrorNode: async (error: Error) => makeErrorNode(error),
            sort: (a, b) => a.label!.localeCompare(b.label!)
        })

        assert.strictEqual(childNodes.length, 2, 'Unexpected child node count')
        assert.deepStrictEqual(childNodes[0], nodeA, 'Unexpected first child node')
        assert.deepStrictEqual(childNodes[1], nodeB, 'Unexpected second child node')
    })

    it('does not sort the child nodes if a sort method is not provided', async () => {
        const childNodes = await makeChildrenNodes({
            getChildNodes: async () => [nodeB, nodeA],
            getErrorNode: async (error: Error) => makeErrorNode(error)
        })

        assert.strictEqual(childNodes.length, 2, 'Unexpected child node count')
        assert.deepStrictEqual(childNodes[0], nodeB, 'Unexpected first child node')
        assert.deepStrictEqual(childNodes[1], nodeA, 'Unexpected second child node')
    })

    function makeErrorNode(error: Error): ErrorNode {
        return new ErrorNode(parentNode, error, error.message)
    }
})
