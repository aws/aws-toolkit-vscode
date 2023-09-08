/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ResourceTypeNode } from '../../../dynamicResources/explorer/nodes/resourceTypeNode'
import { ResourceNode } from '../../../dynamicResources/explorer/nodes/resourceNode'

const fakeIdentifier = 'someidentifier'
const fakeArn = 'arn:fooPartion:fooService:fooRegion:1234:fooType/someidentifier'
const fakeContextValue = 'FooContext'

describe('ResourceNode', function () {
    it('initializes name and tooltip', async function () {
        const testNode = new ResourceNode({} as ResourceTypeNode, fakeIdentifier)
        assert.strictEqual(testNode.label, fakeIdentifier)
        assert.strictEqual(testNode.tooltip, fakeIdentifier)
        assert.strictEqual(testNode.identifier, fakeIdentifier)
    })

    it('parses resource ARN to get friendly name for label', async function () {
        const testNode = new ResourceNode({} as ResourceTypeNode, fakeArn)
        assert.strictEqual(testNode.label, 'fooType/someidentifier')
    })

    it('uses full ARN for tooltip', async function () {
        const testNode = new ResourceNode({} as ResourceTypeNode, fakeArn)
        assert.strictEqual(testNode.tooltip, fakeArn)
    })

    it('uses provided contextValue', async function () {
        const testNode = new ResourceNode({} as ResourceTypeNode, fakeArn, fakeContextValue)
        assert.strictEqual(testNode.contextValue, fakeContextValue)
    })

    it('uses default contextValue if none is provided', async function () {
        const testNode = new ResourceNode({} as ResourceTypeNode, fakeArn)
        assert.strictEqual(testNode.contextValue, 'ResourceNode')
    })
})
