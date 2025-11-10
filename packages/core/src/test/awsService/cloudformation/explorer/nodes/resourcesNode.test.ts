/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { TreeItemCollapsibleState } from 'vscode'
import { ResourcesNode } from '../../../../../awsService/cloudformation/explorer/nodes/resourcesNode'
import { ResourcesManager } from '../../../../../awsService/cloudformation/resources/resourcesManager'
import { ResourceList } from '../../../../../awsService/cloudformation/cfn/resourceRequestTypes'

describe('ResourcesNode', function () {
    let resourcesNode: ResourcesNode
    let mockResourcesManager: ResourcesManager

    beforeEach(function () {
        mockResourcesManager = {} as ResourcesManager
        resourcesNode = new ResourcesNode(mockResourcesManager)
    })

    describe('constructor', function () {
        it('should set correct properties', function () {
            assert.strictEqual(resourcesNode.label, 'Resources')
            assert.strictEqual(resourcesNode.contextValue, 'resourceSection')
            assert.strictEqual(resourcesNode.collapsibleState, TreeItemCollapsibleState.Collapsed)
        })
    })

    describe('getChildren', function () {
        it('should return ResourceTypeNode for each selected type', async function () {
            mockResourcesManager.getSelectedResourceTypes = () => ['AWS::S3::Bucket', 'AWS::Lambda::Function']
            mockResourcesManager.get = () => []

            const children = await resourcesNode.getChildren()
            assert.strictEqual(children.length, 2)
            assert.strictEqual(children[0].label, 'AWS::S3::Bucket')
            assert.strictEqual(children[1].label, 'AWS::Lambda::Function')
        })

        it('should pass loaded resourceList when available', async function () {
            const loadedResource: ResourceList = {
                typeName: 'AWS::S3::Bucket',
                resourceIdentifiers: ['bucket-1', 'bucket-2'],
            }

            mockResourcesManager.getSelectedResourceTypes = () => ['AWS::S3::Bucket']
            mockResourcesManager.get = () => [loadedResource]

            const children = await resourcesNode.getChildren()
            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].label, 'AWS::S3::Bucket')
            assert.strictEqual(children[0].description, '(2)')
        })

        it('should return empty array when no types selected', async function () {
            mockResourcesManager.getSelectedResourceTypes = () => []
            mockResourcesManager.get = () => []

            const children = await resourcesNode.getChildren()
            assert.strictEqual(children.length, 0)
        })
    })
})
