/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { PropertyNode } from '../../../cdk/explorer/nodes/propertyNode'

describe('PropertyNode', function () {
    const label = 'myProperty'

    it('initializes label', async function () {
        const testNode = new PropertyNode(label, 'blue').getTreeItem()
        assert.strictEqual(testNode.label, `${label}: blue`)
    })

    it('returns no children when property does not have nested values', async function () {
        const testNode = new PropertyNode(label, 'purple')

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 0, 'Expected no child nodes for a property with non-nested properties')
    })

    it('returns single child when property has a string value', async function () {
        const value = 'string value'
        const children: { [key: string]: any } = { key: value }
        const testNode = new PropertyNode(label, children)

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 1, 'Expected a single property node for a string property')
        assert.strictEqual((await childNodes[0].getTreeItem()).label, `key: ${value}`)
    })

    it('returns single child when property has a boolean value', async function () {
        const children: { [key: string]: any } = { key: true }
        const testNode = new PropertyNode(label, children)

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 1, 'Expected a single property node for a boolean property')
        assert.strictEqual((await childNodes[0].getTreeItem()).label, 'key: true')
    })

    it('returns single child when property has an int value', async function () {
        const value = 100
        const children: { [key: string]: any } = { key: value }
        const testNode = new PropertyNode(label, children)

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 1, 'Expected a single property node for an int property')
        assert.strictEqual(
            (await childNodes[0].getTreeItem()).label,
            `key: ${value}`,
            'Unexpected label on PropertyNode'
        )
    })

    it('returns a nested property node with a property node for each value in the array', async function () {
        const values = ['one', 'two', 'three']
        const children: { [key: string]: any } = { key: values }

        const testNode = new PropertyNode(label, children)

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 1, 'expected nested property to have a child node for array')
        assert.strictEqual((await childNodes[0].getTreeItem()).label, 'key', 'Unexpected label on node')

        const childPropertyNodes = await childNodes[0].getChildren?.()
        assert.strictEqual(childPropertyNodes?.length, 3, 'Expected each value in nested array to have a child node')
    })

    it('returns a nested property node with nested object as child property nodes', async function () {
        const nestedObject = {
            evenMoreNested: 'nestedValue',
        }
        const value = {
            nestedKey: nestedObject,
        }

        const children: { [key: string]: any } = { key: value }
        const testNode = new PropertyNode(label, children)

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 1, 'Expected nested property of object type to have child nodes')
        assert.strictEqual((await childNodes[0].getTreeItem()).label, 'key')

        const grandChildren = await childNodes[0]?.getChildren?.()
        assert.strictEqual(grandChildren?.length, 1, 'Expected nested property of object type to have grandchild nodes')
        assert.strictEqual((await grandChildren[0].getTreeItem()).label, 'nestedKey')
    })
})
