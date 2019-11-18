/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { ConstructNode } from '../../../cdk/explorer/nodes/constructNode'
import { ConstructTreeEntity } from '../../../cdk/explorer/tree/types'
import { cdk } from '../../../cdk/globals'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../utilities/iconPathUtils'
import * as treeUtils from '../utilities/treeTestUtils'

describe('ConstructNode', () => {
    before(async () => {
        setupTestIconPaths()
    })

    after(async () => {
        clearTestIconPaths()
    })

    const label = 'MyConstruct'
    const path = 'Path/To/MyConstruct'

    it('initializes label and tooltip', async () => {
        const testNode = generateTestNode(label, path)
        assert.strictEqual(testNode.label, label)
        assert.strictEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
        assert.strictEqual(testNode.id, path)
        assert.strictEqual(testNode.tooltip, path)
    })

    it('initializes icon paths for CloudFormation resources', async () => {
        const treeEntity: ConstructTreeEntity = {
            id: label,
            path: path,
            children: treeUtils.generateTreeChildResource(),
            attributes: treeUtils.generateAttributes()
        }

        const testNode = new ConstructNode(label, vscode.TreeItemCollapsibleState.Collapsed, treeEntity)

        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, cdk.iconPaths.dark.cloudFormation, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, cdk.iconPaths.light.cloudFormation, 'Unexpected light icon path')
    })

    it('initializes icon paths for CDK constructs', async () => {
        const testNode = new ConstructNode(
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            treeUtils.generateConstructTreeEntity(label, path)
        )
        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, cdk.iconPaths.dark.cdk, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, cdk.iconPaths.light.cdk, 'Unexpected light icon path')
    })

    it('returns no child nodes if construct does not have any', async () => {
        const testNode = new ConstructNode(
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            treeUtils.generateConstructTreeEntity(label, path)
        )

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 0, 'Unexpected child nodes')
    })

    it('child node has no collapsible state if it has no children or attributes', async () => {
        const treeEntity: ConstructTreeEntity = {
            id: label,
            path: path,
            children: treeUtils.generateTreeChildResource()
        }
        const testNode = new ConstructNode(label, vscode.TreeItemCollapsibleState.Collapsed, treeEntity)

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0].collapsibleState, vscode.TreeItemCollapsibleState.None)
    })

    it('child node is collapsed if construct has child with attributes', async () => {
        const childWithAttributes = treeUtils.generateTreeChildResource()
        // tslint:disable-next-line: no-unsafe-any
        childWithAttributes.Resource.attributes = treeUtils.generateAttributes()

        const treeEntity: ConstructTreeEntity = {
            id: label,
            path: path,
            children: childWithAttributes
        }

        const testNode = new ConstructNode(label, vscode.TreeItemCollapsibleState.Collapsed, treeEntity)

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0].collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
    })

    it('returns child node if a construct has grandchildren', async () => {
        const testNode = new ConstructNode(
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            treeUtils.generateConstructTreeEntity(label, path, true)
        )

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ConstructNode, true)
    })
})

function generateTestNode(label: string, path: string): ConstructNode {
    return new ConstructNode(
        label,
        vscode.TreeItemCollapsibleState.Collapsed,
        treeUtils.generateConstructTreeEntity(label, path)
    )
}
