/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import { ConstructNode } from '../../../cdk/explorer/nodes/constructNode'
import { PropertyNode } from '../../../cdk/explorer/nodes/propertyNode'
import { ConstructTreeEntity } from '../../../cdk/explorer/tree/types'
import { cdk } from '../../../cdk/globals'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../iconPathUtils'
import * as treeUtils from '../treeTestUtils'

describe('ConstructNode', function () {
    before(async function () {
        setupTestIconPaths()
    })

    after(async function () {
        clearTestIconPaths()
    })

    const label = 'MyConstruct'
    const constructTreePath = 'Path/To/MyConstruct'
    const cdkJsonPath = path.join('the', 'road', 'to', 'cdk.json')

    it('initializes label and tooltip', async function () {
        const testNode = generateTestNode(label)
        assert.strictEqual(testNode.label, label)
        assert.strictEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
        assert.strictEqual(testNode.tooltip, constructTreePath)
    })

    it("returns id that includes parent's id and it's own label", async () => {
        const testNode = generateTestNode(label)
        assert.strictEqual(testNode.id, `${cdkJsonPath}/${label}`)
    })

    it('initializes icon paths for CloudFormation resources', async function () {
        const treeEntity: ConstructTreeEntity = {
            id: label,
            path: constructTreePath,
            children: treeUtils.generateTreeChildResource(),
            attributes: treeUtils.generateAttributes(),
        }

        const testNode = new ConstructNode(
            new FakeParentNode(cdkJsonPath),
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            treeEntity
        )

        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, cdk.iconPaths.dark.cloudFormation, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, cdk.iconPaths.light.cloudFormation, 'Unexpected light icon path')
    })

    it('initializes icon paths for CDK constructs', async function () {
        const testNode = new ConstructNode(
            new FakeParentNode(cdkJsonPath),
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            treeUtils.generateConstructTreeEntity(label, constructTreePath)
        )
        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, cdk.iconPaths.dark.cdk, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, cdk.iconPaths.light.cdk, 'Unexpected light icon path')
    })

    it('returns no child nodes if construct does not have any', async function () {
        const testNode = new ConstructNode(
            new FakeParentNode(cdkJsonPath),
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            treeUtils.generateConstructTreeEntity(label, constructTreePath)
        )

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 0, 'Unexpected child nodes')
    })

    it('child node has no collapsible state if it has no children or attributes', async function () {
        const treeEntity: ConstructTreeEntity = {
            id: label,
            path: constructTreePath,
            children: treeUtils.generateTreeChildResource(),
        }
        const testNode = new ConstructNode(
            new FakeParentNode(cdkJsonPath),
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            treeEntity
        )

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0].collapsibleState, vscode.TreeItemCollapsibleState.None)
    })

    it('child node is collapsed if construct has child with attributes', async function () {
        const childWithAttributes = treeUtils.generateTreeChildResource()
        childWithAttributes.Resource.attributes = treeUtils.generateAttributes()

        const treeEntity: ConstructTreeEntity = {
            id: label,
            path: constructTreePath,
            children: childWithAttributes,
        }

        const testNode = new ConstructNode(
            new FakeParentNode(cdkJsonPath),
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            treeEntity
        )

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 1, 'Expected child node with attributes to be collapsed')
        assert.strictEqual(childNodes[0].collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
    })

    it('returns child node of PropertyNode when construct has props', async function () {
        const treeEntity: ConstructTreeEntity = {
            id: label,
            path: constructTreePath,
            attributes: treeUtils.generateAttributes(),
        }

        const testNode = new ConstructNode(
            new FakeParentNode(cdkJsonPath),
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            treeEntity
        )

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof PropertyNode, true, 'Expected child node to be a PropertyNode')
    })

    it('returns child nodes of PropertyNode and ConstructNode when construct has props and children', async function () {
        const treeWithChildrenAndProps: ConstructTreeEntity = {
            id: label,
            path: constructTreePath,
            children: { child: treeUtils.generateConstructTreeEntity(label, constructTreePath) },
            attributes: treeUtils.generateAttributes(),
        }

        const testNode = new ConstructNode(
            new FakeParentNode(cdkJsonPath),
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            treeWithChildrenAndProps
        )
        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 2)
        assert.strictEqual(childNodes[0] instanceof PropertyNode, true, 'Expected child node to be a PropertyNode')
        assert.strictEqual(childNodes[1] instanceof ConstructNode, true, 'Expected child node to be a ConstructNode')
    })

    it('returns child node if a construct has grandchildren', async function () {
        const testNode = new ConstructNode(
            new FakeParentNode(cdkJsonPath),
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            treeUtils.generateConstructTreeEntity(label, constructTreePath, true)
        )

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ConstructNode, true, 'Expected child node to be a ConstructNode')
    })

    function generateTestNode(displayLabel: string): ConstructNode {
        return new ConstructNode(
            new FakeParentNode(cdkJsonPath),
            displayLabel,
            vscode.TreeItemCollapsibleState.Collapsed,
            treeUtils.generateConstructTreeEntity(displayLabel, constructTreePath)
        )
    }
})

export class FakeParentNode extends AWSTreeNodeBase {
    public constructor(label: string) {
        super(label)
        this.id = label
    }
}
