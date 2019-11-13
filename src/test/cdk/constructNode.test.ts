/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { ConstructNode } from '../../cdk/explorer/nodes/constructNode'
import { cdk } from '../../cdk/globals'
import { IconPath } from '../shared/utilities/iconPathUtils'

describe('ConstructNode', () => {
    const label = 'MyStack'
    const treePath = 'MyStack/MyQueue'

    it('initializes label and tooltip', async () => {
        const testNode = generateTestNode()
        assert.strictEqual(testNode.label, label)
        assert.strictEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
        assert.strictEqual(testNode.id, treePath)
        assert.strictEqual(testNode.tooltip, treePath)
    })

    it('initializes icon paths for CloudFormation resources', async () => {
        const testNode = generateTestNode()
        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark, cdk.iconPaths.dark.cloudFormation, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light, cdk.iconPaths.light.cloudFormation, 'Unexpected light icon path')
    })

    it('initializes icon paths for CDK constructs', async () => {
        const testNode = new ConstructNode(label, treePath, vscode.TreeItemCollapsibleState.Collapsed)
        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark, cdk.iconPaths.dark.cdk, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light, cdk.iconPaths.light.cdk, 'Unexpected light icon path')
    })

    it('returns no child nodes if construct does not have any', async () => {
        const testNode = new ConstructNode(label, treePath, vscode.TreeItemCollapsibleState.Collapsed)

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 0, 'Unexpected child nodes')
    })

    it('child node has no collapsible state if construct has no children or attributes', async () => {
        const testNode = new ConstructNode(
            label,
            treePath,
            vscode.TreeItemCollapsibleState.Collapsed,
            generateTestChildResource()
        )

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0].collapsibleState, vscode.TreeItemCollapsibleState.None)
    })

    it('child node is collapsed if construct has child with attributes', async () => {
        const child = generateTestChildResource()
        child.Resource.attributes = generateTestAttributes()

        const testNode = new ConstructNode(label, treePath, vscode.TreeItemCollapsibleState.Collapsed, child)

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0].collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
    })

    it('returns child node if a construct has grandchildren', async () => {
        const child = generateTestChildResource()
        child.Resource.children = generateTestChildResource()

        const testNode = new ConstructNode(label, treePath, vscode.TreeItemCollapsibleState.Collapsed, child)

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ConstructNode, true)
    })
})

function generateTestNode(): ConstructNode {
    return new ConstructNode('MyStack', 'MyStack/MyQueue', vscode.TreeItemCollapsibleState.Collapsed)
}

function generateTestChildResource(): { [key: string]: any } {
    return {
        Resource: {
            id: 'Resource',
            path: 'MyStack/MyQueue/Resource'
        }
    }
}

function generateTestAttributes(): { [key: string]: any } {
    return {
        'aws:cdk:cloudformation:type': 'AWS::SQS::Queue',
        'aws:cdk:cloudformation:properties': {
            queueName: 'MyAwesomeQueue',
            visibilityTimeout: 120
        }
    }
}
