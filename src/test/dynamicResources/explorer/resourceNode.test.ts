/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ResourceTypeNode } from '../../../dynamicResources/explorer/nodes/resourceTypeNode'
import { ResourceNode } from '../../../dynamicResources/explorer/nodes/resourceNode'

const FAKE_IDENTIFIER = 'someidentifier'
const FAKE_ARN = 'arn:fooPartion:fooService:fooRegion:1234:fooType/someidentifier'
const FAKE_CONTEXT_VALUE = 'FooContext'

describe('ResourceNode', function () {
    it('initializes name and tooltip', async function () {
        const testNode = new ResourceNode({} as ResourceTypeNode, FAKE_IDENTIFIER)
        assert.strictEqual(testNode.label, FAKE_IDENTIFIER)
        assert.strictEqual(testNode.tooltip, FAKE_IDENTIFIER)
        assert.strictEqual(testNode.identifier, FAKE_IDENTIFIER)
    })

    it('parses resource ARN to get friendly name for label', async function () {
        const testNode = new ResourceNode({} as ResourceTypeNode, FAKE_ARN)
        assert.strictEqual(testNode.label, 'fooType/someidentifier')
    })

    it('uses full ARN for tooltip', async function () {
        const testNode = new ResourceNode({} as ResourceTypeNode, FAKE_ARN)
        assert.strictEqual(testNode.tooltip, FAKE_ARN)
    })

    it('uses provided contextValue', async function () {
        const testNode = new ResourceNode({} as ResourceTypeNode, FAKE_ARN, FAKE_CONTEXT_VALUE)
        assert.strictEqual(testNode.contextValue, FAKE_CONTEXT_VALUE)
    })

    it('uses default contextValue if none is provided', async function () {
        const testNode = new ResourceNode({} as ResourceTypeNode, FAKE_ARN)
        assert.strictEqual(testNode.contextValue, 'ResourceNode')
    })
})
