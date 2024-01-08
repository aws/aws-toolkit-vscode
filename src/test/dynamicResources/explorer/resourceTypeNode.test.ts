/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import { ResourcesNode } from '../../../dynamicResources/explorer/nodes/resourcesNode'
import { ResourceNode } from '../../../dynamicResources/explorer/nodes/resourceNode'
import { ResourceTypeNode } from '../../../dynamicResources/explorer/nodes/resourceTypeNode'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'
import { CloudControl } from 'aws-sdk'
import { ResourceTypeMetadata } from '../../../dynamicResources/model/resources'
import sinon from 'sinon'

const fakeTypeName = 'sometype'
const unsortedText = ['zebra', 'Antelope', 'aardvark', 'elephant']
const sortedText = ['aardvark', 'Antelope', 'elephant', 'zebra']

describe('ResourceTypeNode', function () {
    let testNode: ResourceTypeNode

    let resourceIdentifiers: string[]
    let cloudControl: CloudControlClient

    beforeEach(function () {
        cloudControl = {} as any as CloudControlClient

        resourceIdentifiers = ['resource1', 'resource2', 'resource3']
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(cloudControl)
    })

    it('initializes name and tooltip', async function () {
        assert.strictEqual(testNode.label, fakeTypeName)
        assert.strictEqual(testNode.tooltip, fakeTypeName)
    })

    it('returns placeholder node if no resources are found', async function () {
        const resourceIdentifiers: string[] = []
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(cloudControl)

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyHasPlaceholderNode(childNodes)
    })

    it('has ResourceNode child nodes', async function () {
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, resourceIdentifiers.length, 'Unexpected child count')

        childNodes.forEach(node => assert.ok(node instanceof ResourceNode, 'Expected child node to be ResourceNode'))
    })

    it('has child nodes with all operations contextValue when unknown operations', async function () {
        const childNodes = await testNode.getChildren()

        childNodes.forEach(node =>
            assert.strictEqual(
                node.contextValue,
                'CreatableDeletableUpdatableResourceNode',
                'expected the node to have a ResourceNode contextValue'
            )
        )
    })

    it('has child nodes with ResourceNode contextValue including single supported operation', async function () {
        testNode = generateTestNode(cloudControl, ['CREATE'])
        const childNodes = await testNode.getChildren()

        childNodes.forEach(node =>
            assert.strictEqual(
                node.contextValue,
                'CreatableResourceNode',
                'expected the node to have a CreatableResourceNode contextValue'
            )
        )
    })

    it('has child nodes with ResourceNode contextValue including multiple supported operations', async function () {
        testNode = generateTestNode(cloudControl, ['CREATE', 'DELETE'])
        const childNodes = await testNode.getChildren()

        childNodes.forEach(node =>
            assert.strictEqual(
                node.contextValue,
                'CreatableDeletableResourceNode',
                'expected the node to have a CreatableDeletableResourceNode contextValue'
            )
        )
    })

    it('sorts child nodes', async function () {
        resourceIdentifiers = unsortedText
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(cloudControl)

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, sortedText, 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async function () {
        cloudControl.listResources = sinon.stub().rejects(new Error('foo'))
        testNode = generateTestNode(cloudControl)

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyHasErrorNode(childNodes)
    })

    it('has a placeholder node for a child if unsupported action', async function () {
        const error = new Error('foo')
        error.name = 'UnsupportedActionException'
        cloudControl.listResources = sinon.stub().rejects(error)
        testNode = generateTestNode(cloudControl)

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyHasPlaceholderNode(childNodes)
    })

    it('has Documented contextValue if documentation available', function () {
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(cloudControl, [], 'fooDocs')
        assert.strictEqual(testNode.contextValue, 'DocumentedResourceTypeNode')
    })

    it('has Creatable contextValue if create operation present', function () {
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(cloudControl, ['CREATE'])
        assert.strictEqual(testNode.contextValue, 'CreatableResourceTypeNode')
    })

    it('is non expandable if not available', function () {
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(cloudControl, undefined, undefined, false)
        assert.strictEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.None)
    })

    it('has a suitable description if not available', function () {
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(cloudControl, undefined, undefined, false)
        assert.strictEqual(testNode.description, 'Unavailable in region')
    })

    it('has UnavailableResourceTypeNode contextValue if not available', function () {
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(cloudControl, undefined, undefined, false)
        assert.strictEqual(testNode.contextValue, 'UnavailableResourceTypeNode')
    })

    function generateTestNode(
        client: CloudControlClient,
        supportedOperations?: string[],
        documentation?: string,
        available?: boolean
    ): ResourceTypeNode {
        const metadata = {
            operations: supportedOperations,
            documentation,
            available: available ?? true,
        } as ResourceTypeMetadata
        return new ResourceTypeNode({} as ResourcesNode, fakeTypeName, client, metadata)
    }

    function mockCloudControlClient(resourceIdentifiers: string[]): void {
        cloudControl.listResources = sinon.stub().resolves({
            TypeName: fakeTypeName,
            NextToken: undefined,
            ResourceDescriptions: resourceIdentifiers.map<CloudControl.ResourceDescription>(identifier => {
                return {
                    Identifier: identifier,
                    ResourceModel: '',
                }
            }),
        })
    }
})
