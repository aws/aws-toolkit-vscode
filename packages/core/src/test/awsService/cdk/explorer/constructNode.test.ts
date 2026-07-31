/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as treeUtils from '../treeTestUtils'
import { ConstructNode } from '../../../../awsService/cdk/explorer/nodes/constructNode'
import { PropertyNode } from '../../../../awsService/cdk/explorer/nodes/propertyNode'
import { ConstructTreeEntity } from '../../../../awsService/cdk/explorer/tree/types'
import { isStateMachine } from '../../../../awsService/cdk/explorer/nodes/constructNode'
import { CdkAppLocation } from '../../../../awsService/cdk/explorer/cdkProject'
import { getIcon } from '../../../../shared/icons'

describe('ConstructNode', function () {
    const label = 'MyConstruct'
    const constructTreePath = 'Path/To/MyConstruct'
    const cdkJsonPath = path.join('/', 'the', 'road', 'to', 'cdk.json')
    const location: CdkAppLocation = {
        cdkJsonUri: vscode.Uri.file(cdkJsonPath),
        treeUri: vscode.Uri.file(path.join(cdkJsonPath, '..', 'cdk.out', 'tree.json')),
    }

    it('initializes label, tooltip, and icon', async function () {
        const testNode = generateTestNode(label).getTreeItem()

        assert.strictEqual(testNode.label, label)
        assert.strictEqual(testNode.tooltip, constructTreePath)
        assert.strictEqual(testNode.iconPath, getIcon('aws-cdk-logo'))
        assert.strictEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
    })

    it('returns a uri with a fragment pointing to the resource', async () => {
        const testNode = generateTestNode(label)
        const resourceUri = testNode.resource.location

        assert.strictEqual(resourceUri.path, location.treeUri.path)
        assert.strictEqual(resourceUri.fragment, testNode.resource.construct.path)
    })

    it('initializes icon paths for CDK constructs', async function () {
        const testNode = new ConstructNode(location, {
            ...treeUtils.generateConstructTreeEntity('', constructTreePath),
            attributes: treeUtils.generateAttributes(),
        }).getTreeItem()

        assert.strictEqual(testNode.iconPath, getIcon('aws-cloudformation-stack'))
    })

    it('returns no child nodes if construct does not have any', async function () {
        const testNode = new ConstructNode(location, treeUtils.generateConstructTreeEntity(label, constructTreePath))

        const childNodes = testNode.getChildren()
        assert.strictEqual(childNodes.length, 0, 'Unexpected child nodes')
    })

    it('child node has no collapsible state if it has no children or attributes', async function () {
        const treeEntity: ConstructTreeEntity = {
            id: label,
            path: constructTreePath,
            children: treeUtils.generateTreeChildResource(),
        }
        const testNode = new ConstructNode(location, treeEntity)

        const childNodes = testNode.getChildren()
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual((await childNodes[0].getTreeItem()).collapsibleState, vscode.TreeItemCollapsibleState.None)
    })

    it('child node is collapsed if construct has child with attributes', async function () {
        const childWithAttributes = treeUtils.generateTreeChildResource()
        childWithAttributes.Resource.attributes = treeUtils.generateAttributes()

        const treeEntity: ConstructTreeEntity = {
            id: label,
            path: constructTreePath,
            children: childWithAttributes,
        }

        const testNode = new ConstructNode(location, treeEntity)

        const childNodes = testNode.getChildren()
        assert.strictEqual(childNodes.length, 1, 'Expected child node with attributes to be collapsed')
        assert.strictEqual(
            (await childNodes[0].getTreeItem()).collapsibleState,
            vscode.TreeItemCollapsibleState.Collapsed
        )
    })

    it('returns child node of PropertyNode when construct has props', async function () {
        const treeEntity: ConstructTreeEntity = {
            id: label,
            path: constructTreePath,
            attributes: treeUtils.generateAttributes(),
        }

        const testNode = new ConstructNode(location, treeEntity)

        const childNodes = testNode.getChildren()
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

        const testNode = new ConstructNode(location, treeWithChildrenAndProps)
        const childNodes = testNode.getChildren()
        assert.strictEqual(childNodes.length, 2)
        assert.strictEqual(childNodes[0] instanceof PropertyNode, true, 'Expected child node to be a PropertyNode')
        assert.strictEqual(childNodes[1] instanceof ConstructNode, true, 'Expected child node to be a ConstructNode')
    })

    it('returns child node if a construct has grandchildren', async function () {
        const testNode = new ConstructNode(
            location,
            treeUtils.generateConstructTreeEntity(label, constructTreePath, true)
        )

        const childNodes = testNode.getChildren()
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ConstructNode, true, 'Expected child node to be a ConstructNode')
    })

    it('opens the source location on click when the source map has an entry', function () {
        const sourceFile = path.join('/', 'project', 'lib', 'my-stack.ts')
        const sourceMap = new Map([[constructTreePath, { sourceLocation: { file: sourceFile, line: 12, column: 5 } }]])
        const construct = treeUtils.generateConstructTreeEntity(label, constructTreePath)

        const item = new ConstructNode(location, construct, sourceMap).getTreeItem()

        assert.ok(item.command, 'Expected a command to open source')
        assert.strictEqual(item.command.command, 'vscode.open')
        const [uri, options] = item.command.arguments as [vscode.Uri, vscode.TextDocumentShowOptions]
        assert.strictEqual(uri.fsPath, vscode.Uri.file(sourceFile).fsPath)
        // SourceLocation is 1-based; vscode.Position is 0-based.
        assert.strictEqual(options.selection?.start.line, 11)
        assert.strictEqual(options.selection?.start.character, 4)
    })

    it('sets no command when the source map has no entry for the construct', function () {
        const sourceMap = new Map([['some/other/path', { sourceLocation: { file: '/x.ts', line: 1, column: 1 } }]])
        const construct = treeUtils.generateConstructTreeEntity(label, constructTreePath)

        const item = new ConstructNode(location, construct, sourceMap).getTreeItem()

        assert.strictEqual(item.command, undefined)
    })

    it('marks nodes with a template file and exposes the template target', function () {
        const templateFile = path.join('/', 'project', 'cdk.out', 'Stack.template.json')
        const sourceMap = new Map([[constructTreePath, { templateFile, templateOffset: 42 }]])
        const construct = treeUtils.generateConstructTreeEntity(label, constructTreePath)

        const node = new ConstructNode(location, construct, sourceMap)
        const item = node.getTreeItem()

        assert.ok((item.contextValue ?? '').endsWith('WithTemplate'), 'Expected a WithTemplate context value')
        assert.strictEqual(node.resource.templateFile, templateFile)
        assert.strictEqual(node.resource.templateOffset, 42)
    })

    it('does not mark nodes that have no template file', function () {
        const sourceMap = new Map([[constructTreePath, { sourceLocation: { file: '/x.ts', line: 1, column: 1 } }]])
        const construct = treeUtils.generateConstructTreeEntity(label, constructTreePath)

        const item = new ConstructNode(location, construct, sourceMap).getTreeItem()

        assert.strictEqual(item.contextValue, 'awsCdkConstructNode')
    })

    function generateTestNode(displayLabel: string): ConstructNode {
        return new ConstructNode(location, treeUtils.generateConstructTreeEntity(displayLabel, constructTreePath))
    }
})

describe('Check if ConstructNode is a state machine', function () {
    it('returns true when tree node contains a node with id === "Resource" and type === "StateMachine"', async function () {
        const construct: ConstructTreeEntity = {
            id: 'StateMachine',
            path: 'aws-stepfunctions-integ/StateMachine',
            children: {
                Resource: {
                    id: 'Resource',
                    path: 'aws-stepfunctions-integ/StateMachine/Resource',
                    attributes: {
                        'aws:cdk:cloudformation:type': 'AWS::StepFunctions::StateMachine',
                    },
                },
            },
        }

        assert.ok(isStateMachine(construct))
    })

    it('returns true when tree node contains a node with id !== "Resource" and type === "StateMachine"', async function () {
        const construct: ConstructTreeEntity = {
            id: 'StateMachine',
            path: 'aws-stepfunctions-integ/StateMachine',
            children: {
                Other: {
                    id: 'Other',
                    path: 'aws-stepfunctions-integ/StateMachine/Resource',
                    attributes: {
                        'aws:cdk:cloudformation:type': 'AWS::StepFunctions::StateMachine',
                    },
                },
            },
        }

        assert.strictEqual(isStateMachine(construct), false)
    })

    it('returns false when tree node contains a node with id !== "Resource" and type !== "StateMachine"', async function () {
        const construct: ConstructTreeEntity = {
            id: 'StateMachine',
            path: 'aws-stepfunctions-integ/LambdaFunction',
            children: {
                Other: {
                    id: 'Other',
                    path: 'aws-stepfunctions-integ/LambdaFunction/Resource',
                    attributes: {
                        'aws:cdk:cloudformation:type': 'AWS::StepFunctions::LambdaFunction',
                    },
                },
            },
        }
        assert.strictEqual(isStateMachine(construct), false)
    })

    it('returns false when tree node contains a node with id === "Resource" and type !== "StateMachine"', async function () {
        const construct: ConstructTreeEntity = {
            id: 'StateMachine',
            path: 'aws-stepfunctions-integ/LambdaFunction',
            children: {
                Resource: {
                    id: 'Resource',
                    path: 'aws-stepfunctions-integ/LambdaFunction/Resource',
                    attributes: {
                        'aws:cdk:cloudformation:type': 'AWS::StepFunctions::LambdaFunction',
                    },
                },
            },
        }
        assert.strictEqual(isStateMachine(construct), false)
    })
})
