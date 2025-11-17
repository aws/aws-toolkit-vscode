/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { TreeItemCollapsibleState } from 'vscode'
import { ResourceTypeNode } from '../../../../../awsService/cloudformation/explorer/nodes/resourceTypeNode'
import { ResourceList } from '../../../../../awsService/cloudformation/cfn/resourceRequestTypes'
import { ResourcesManager } from '../../../../../awsService/cloudformation/resources/resourcesManager'

describe('ResourceTypeNode', function () {
    let mockResourceList: ResourceList
    let resourceTypeNode: ResourceTypeNode
    let mockResourcesManager: ResourcesManager

    beforeEach(function () {
        mockResourceList = {
            typeName: 'AWS::S3::Bucket',
            resourceIdentifiers: ['bucket-1', 'bucket-2', 'bucket-3'],
        }

        mockResourcesManager = {} as ResourcesManager

        resourceTypeNode = new ResourceTypeNode('AWS::S3::Bucket', mockResourcesManager, mockResourceList)
    })

    describe('constructor', function () {
        it('should set correct properties when resourceList is provided', function () {
            assert.strictEqual(resourceTypeNode.label, 'AWS::S3::Bucket')
            assert.strictEqual(resourceTypeNode.description, '(3)')
            assert.strictEqual(resourceTypeNode.contextValue, 'resourceType')
            assert.strictEqual(resourceTypeNode.collapsibleState, TreeItemCollapsibleState.Collapsed)
        })

        it('should set correct properties when resourceList is undefined', function () {
            const lazyNode = new ResourceTypeNode('AWS::Lambda::Function', mockResourcesManager)
            assert.strictEqual(lazyNode.label, 'AWS::Lambda::Function')
            assert.strictEqual(lazyNode.description, undefined)
            assert.strictEqual(lazyNode.contextValue, 'resourceType')
        })
    })

    describe('getChildren', function () {
        it('should return resource nodes for each identifier', async function () {
            const children = await resourceTypeNode.getChildren()
            assert.strictEqual(children.length, 3)

            const labels = children.map((child) => child.label)
            assert(labels.includes('bucket-1'))
            assert(labels.includes('bucket-2'))
            assert(labels.includes('bucket-3'))
        })

        it('should lazy load resources when not provided', async function () {
            const lazyResourceList: ResourceList = {
                typeName: 'AWS::DynamoDB::Table',
                resourceIdentifiers: ['table-1'],
            }

            mockResourcesManager.loadResourceType = async () => {}
            mockResourcesManager.get = () => [lazyResourceList]

            const lazyNode = new ResourceTypeNode('AWS::DynamoDB::Table', mockResourcesManager)
            const children = await lazyNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].label, 'table-1')
        })
    })

    describe('empty resource list', function () {
        it('should handle empty resource identifiers', async function () {
            const emptyResourceList: ResourceList = {
                typeName: 'AWS::Lambda::Function',
                resourceIdentifiers: [],
            }

            const emptyNode = new ResourceTypeNode('AWS::Lambda::Function', mockResourcesManager, emptyResourceList)
            assert.strictEqual(emptyNode.description, '(0)')

            const children = await emptyNode.getChildren()
            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].label, 'No resources found')
        })
    })

    describe('pagination', function () {
        it('should show load more node when nextToken exists', async function () {
            const paginatedList: ResourceList = {
                typeName: 'AWS::EC2::Instance',
                resourceIdentifiers: ['i-1', 'i-2'],
                nextToken: 'token123',
            }

            const paginatedNode = new ResourceTypeNode('AWS::EC2::Instance', mockResourcesManager, paginatedList)
            assert.strictEqual(paginatedNode.description, '(2+)')
            assert.strictEqual(paginatedNode.contextValue, 'resourceTypeWithMore')

            const children = await paginatedNode.getChildren()
            assert.strictEqual(children.length, 3)
            assert.strictEqual(children[2].label, '[Load More...]')
        })

        it('should not show load more node when no nextToken', async function () {
            const children = await resourceTypeNode.getChildren()
            assert.strictEqual(children.length, 3)
            assert(!children.some((child) => child.label === '[Load More...]'))
        })
    })
})
