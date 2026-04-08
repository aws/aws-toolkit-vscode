/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { LambdaCapacityProviderNode } from '../../../lambda/explorer/lambdaCapacityProviderNode'
import { contextValueLambdaCapacityProvider } from '../../../lambda/explorer/lambdaCapacityProviderNode'

describe('LambdaCapacityProviderNode', function () {
    it('instantiates without issue', async function () {
        const fakeCapacityProviderResource = {
            LogicalResourceId: 'testLogicalResourceId',
            PhysicalResourceId: 'testPhysicalResourceId',
        }

        const testNode = new LambdaCapacityProviderNode(
            'someregioncode',
            fakeCapacityProviderResource,
            contextValueLambdaCapacityProvider
        )
        assert.ok(testNode)
        assert.strictEqual(testNode.regionCode, 'someregioncode')
        assert.strictEqual(testNode.label, fakeCapacityProviderResource.LogicalResourceId)
        assert.strictEqual(testNode.name, fakeCapacityProviderResource.LogicalResourceId)
    })
})
