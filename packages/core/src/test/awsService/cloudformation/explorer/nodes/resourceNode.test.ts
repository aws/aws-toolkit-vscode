/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { TreeItemCollapsibleState } from 'vscode'
import { ResourceNode } from '../../../../../awsService/cloudformation/explorer/nodes/resourceNode'

describe('ResourceNode', function () {
    let resourceNode: ResourceNode

    beforeEach(function () {
        resourceNode = new ResourceNode('my-bucket-123', 'AWS::S3::Bucket')
    })

    describe('constructor', function () {
        it('should set correct properties', function () {
            assert.strictEqual(resourceNode.label, 'my-bucket-123')
            assert.strictEqual(resourceNode.resourceIdentifier, 'my-bucket-123')
            assert.strictEqual(resourceNode.resourceType, 'AWS::S3::Bucket')
            assert.strictEqual(resourceNode.contextValue, 'resource')
            assert.strictEqual(resourceNode.collapsibleState, TreeItemCollapsibleState.None)
        })
    })

    describe('getChildren', function () {
        it('should return empty array', async function () {
            const children = await resourceNode.getChildren()
            assert.strictEqual(children.length, 0)
        })
    })
})
