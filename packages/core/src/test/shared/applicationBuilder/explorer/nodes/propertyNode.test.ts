/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { generatePropertyNodes, PropertyNode } from '../../../../../awsService/appBuilder/explorer/nodes/propertyNode'
import { getIcon } from '../../../../../shared/icons'

describe('PropertyNode', () => {
    describe('constructor', () => {
        it('should set properties correctly', async () => {
            const expectedKey = 'key'
            const expectedValue = 'value'
            const node = new PropertyNode(expectedKey, expectedValue)
            assert.strictEqual(node.id, expectedKey)
            assert.strictEqual(node.resource, expectedValue)
        })
    })

    describe('getChildren', () => {
        it('should return an empty array for primitive values', async () => {
            const node = new PropertyNode('key', 'value')
            const children = await node.getChildren()
            assert.deepStrictEqual(children, [])
        })

        it('should return an array of PropertyNodes for objects', async () => {
            const node = new PropertyNode('key', { foo: 'bar', baz: 42 })
            const children = await node.getChildren()
            assert(children.every((child) => child instanceof PropertyNode))
            assert.deepStrictEqual(
                children.map(({ id, resource }) => ({ id, resource })),
                [
                    { id: 'foo', resource: 'bar' },
                    { id: 'baz', resource: 42 },
                ]
            )
        })

        it('should return an array of PropertyNodes for arrays of objects', async () => {
            const node = new PropertyNode('key', [
                { foo: 'bar', baz: 42 },
                { foo: 'barz', baz: 52 },
            ])
            const children = await node.getChildren()
            assert(children.every((child) => child instanceof PropertyNode))
            assert.deepStrictEqual(
                children.map(({ id, resource }) => ({ id, resource })),
                [
                    { id: '0', resource: { foo: 'bar', baz: 42 } },
                    { id: '1', resource: { foo: 'barz', baz: 52 } },
                ]
            )
        })
    })

    describe('getTreeItem', () => {
        const validateGetTreeItemBasic = (treeItem: vscode.TreeItem) => {
            assert.strictEqual(treeItem.contextValue, 'awsAppBuilderPropertyNode')
            assert.strictEqual(treeItem.iconPath, getIcon('vscode-gear'))
        }

        it('should return a TreeItem with the correct label for primitive values', () => {
            const node = new PropertyNode('key', 'value')
            const treeItem = node.getTreeItem()
            validateGetTreeItemBasic(treeItem)
            assert.strictEqual(treeItem.label, 'key: value')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
        })

        it('should return a TreeItem with the correct label and collapsibleState for objects', () => {
            const node = new PropertyNode('key', { foo: 'bar', baz: 42 })
            const treeItem = node.getTreeItem()
            validateGetTreeItemBasic(treeItem)
            assert.strictEqual(treeItem.label, 'key')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
        })

        it('should return a TreeItem with the correct label and collapsibleState for arrays of objects', () => {
            const node = new PropertyNode('key', [
                { foo: 'bar', baz: 42 },
                { foo: 'barz', baz: 52 },
            ])
            const treeItem = node.getTreeItem()
            validateGetTreeItemBasic(treeItem)
            assert.strictEqual(treeItem.label, 'key')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
        })
    })

    describe('generatePropertyNodes', () => {
        it('should filter out Id, Type, and Events properties', () => {
            const properties = {
                Id: 'id',
                Type: 'type',
                Events: ['event1', 'event2'],
                foo: 'bar',
                baz: 42,
            }
            const nodes = generatePropertyNodes(properties)
            const expectedNodes = [
                { key: 'foo', value: 'bar' },
                { key: 'baz', value: 42 },
            ]
            assert.strictEqual(nodes.length, expectedNodes.length)
            for (const [index, node] of nodes.entries()) {
                assert(node instanceof PropertyNode)
                assert.strictEqual(node.id, expectedNodes[index].key)
                assert.strictEqual(node.resource, expectedNodes[index].value)
            }
        })
    })
})
