/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { PropertyNode } from '../../../cdk/explorer/nodes/propertyNode'
import { ext } from '../../../shared/extensionGlobals'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../../shared/utilities/iconPathUtils'

describe('PropertyNode', () => {
    before(async () => {
        setupTestIconPaths()
    })

    after(async () => {
        clearTestIconPaths()
    })

    const label = 'myProperty'

    it('initializes label', async () => {
        const testNode = new PropertyNode(label, vscode.TreeItemCollapsibleState.Collapsed)
        assert.strictEqual(testNode.label, label)
    })

    it('initializes icon paths for properties', async () => {
        const testNode = new PropertyNode(label, vscode.TreeItemCollapsibleState.Collapsed)

        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, ext.iconPaths.dark.settings, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, ext.iconPaths.light.settings, 'Unexpected light icon path')
    })

    it('returns no children when property does not have nested values', async () => {
        const testNode = new PropertyNode(label, vscode.TreeItemCollapsibleState.Collapsed)

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 0)
    })

    it('returns single child when property has a string value', async () => {
        const value = 'string value'
        const children: { [key: string]: any } = { key: value }
        const testNode = new PropertyNode(label, vscode.TreeItemCollapsibleState.Collapsed, children)

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0].label, `key: ${value}`)
        assert.strictEqual(childNodes[0].children, undefined)
    })

    it('returns single child when property has a boolean value', async () => {
        const children: { [key: string]: any } = { key: true }
        const testNode = new PropertyNode(label, vscode.TreeItemCollapsibleState.Collapsed, children)

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0].label, 'key: true')
        assert.strictEqual(childNodes[0].children, undefined)
    })

    it('returns single child when property has an int value', async () => {
        const value = 100
        const children: { [key: string]: any } = { key: value }
        const testNode = new PropertyNode(label, vscode.TreeItemCollapsibleState.Collapsed, children)

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0].label, `key: ${value}`)
        assert.strictEqual(childNodes[0].children, undefined)
    })

    it('returns a nested property node with values of an array as child property nodes', async () => {
        const values = ['one', 'two', 'three']
        const children: { [key: string]: any } = { key: values }

        const testNode = new PropertyNode(label, vscode.TreeItemCollapsibleState.Collapsed, children)

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0].label, 'key')
        assert.strictEqual(childNodes[0].children, values)
    })

    it('returns a nested property node with nested object as child property nodes', async () => {
        const nestedObject = {
            evenMoreNested: 'nestedValue'
        }
        const value = {
            nestedKey: nestedObject
        }

        const children: { [key: string]: any } = { key: value }
        const testNode = new PropertyNode(label, vscode.TreeItemCollapsibleState.Collapsed, children)

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0].label, 'key')
        assert.strictEqual(childNodes[0].children, value)

        const grandChildren = await childNodes[0].getChildren()
        assert.strictEqual(grandChildren.length, 1)
        assert.strictEqual(grandChildren[0].label, 'nestedKey')
        assert.strictEqual(grandChildren[0].children, nestedObject)
    })
})
