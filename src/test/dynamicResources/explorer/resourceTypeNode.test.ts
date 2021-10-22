/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { anything } from 'ts-mockito'
import { ResourcesNode } from '../../../dynamicResources/explorer/nodes/resourcesNode'
import { ResourceNode } from '../../../dynamicResources/explorer/nodes/resourceNode'
import { ResourceTypeNode } from '../../../dynamicResources/explorer/nodes/resourceTypeNode'
import {
    assertNodeListOnlyContainsErrorNode,
    assertNodeListOnlyContainsPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { deepEqual, instance, mock, when } from '../../utilities/mockito'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'
import { CloudControl } from 'aws-sdk'
import { ResourceTypeMetadata } from '../../../dynamicResources/model/resources'

const FAKE_TYPE_NAME = 'sometype'
const UNSORTED_TEXT = ['zebra', 'Antelope', 'aardvark', 'elephant']
const SORTED_TEXT = ['aardvark', 'Antelope', 'elephant', 'zebra']

describe('ResourceTypeNode', function () {
    let testNode: ResourceTypeNode

    let resourceIdentifiers: string[]
    let cloudControl: CloudControlClient

    beforeEach(function () {
        cloudControl = mock()

        resourceIdentifiers = ['resource1', 'resource2', 'resource3']
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(instance(cloudControl))
    })

    it('initializes name and tooltip', async function () {
        assert.strictEqual(testNode.label, FAKE_TYPE_NAME)
        assert.strictEqual(testNode.tooltip, FAKE_TYPE_NAME)
    })

    it('returns placeholder node if no resources are found', async function () {
        const resourceIdentifiers: string[] = []
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(instance(cloudControl))

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsPlaceholderNode(childNodes)
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
        testNode = generateTestNode(instance(cloudControl), ['CREATE'])
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
        testNode = generateTestNode(instance(cloudControl), ['CREATE', 'DELETE'])
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
        resourceIdentifiers = UNSORTED_TEXT
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(instance(cloudControl))

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, SORTED_TEXT, 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async function () {
        cloudControl = mock()
        when(cloudControl.listResources(anything())).thenThrow(new Error('foo'))
        testNode = generateTestNode(instance(cloudControl))

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyContainsErrorNode(childNodes)
    })

    it('has a placeholder node for a child if unsupported action', async function () {
        cloudControl = mock()
        const error = new Error('foo')
        error.name = 'UnsupportedActionException'
        when(cloudControl.listResources(anything())).thenThrow(error)
        testNode = generateTestNode(instance(cloudControl))

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyContainsPlaceholderNode(childNodes)
    })

    it('has Documented contextValue if documentation available', function () {
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(instance(cloudControl), [], 'fooDocs')
        assert.strictEqual(testNode.contextValue, 'DocumentedResourceTypeNode')
    })

    it('has Creatable contextValue if create operation present', function () {
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(instance(cloudControl), ['CREATE'])
        assert.strictEqual(testNode.contextValue, 'CreatableResourceTypeNode')
    })

    it('is non expandable if not available', function () {
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(instance(cloudControl), undefined, undefined, false)
        assert.strictEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.None)
    })

    it('has a suitable description if not available', function () {
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(instance(cloudControl), undefined, undefined, false)
        assert.strictEqual(testNode.description, 'Unavailable in region')
    })

    it('has UnavailableResourceTypeNode contextValue if not available', function () {
        mockCloudControlClient(resourceIdentifiers)

        testNode = generateTestNode(instance(cloudControl), undefined, undefined, false)
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
        return new ResourceTypeNode({} as ResourcesNode, FAKE_TYPE_NAME, client, metadata)
    }

    function mockCloudControlClient(resourceIdentifiers: string[]): void {
        when(
            cloudControl.listResources(
                deepEqual({
                    TypeName: FAKE_TYPE_NAME,
                    NextToken: anything(),
                })
            )
        ).thenResolve({
            TypeName: FAKE_TYPE_NAME,
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
