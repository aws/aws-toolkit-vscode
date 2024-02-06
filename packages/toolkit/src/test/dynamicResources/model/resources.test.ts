/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getResourceTypes } from '../../../dynamicResources/model/resources'

const fakeResourceModel = {
    Type1: {
        operations: ['CREATE', 'READ', 'DELETE', 'UPDATE'],
        documentation: 'foo',
    },
    Type2: {
        operations: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'LIST'],
        documentation: 'bar',
    },
    Type3: {
        operations: ['READ', 'LIST'],
        documentation: 'baz',
    },
}

describe('getResourceTypes', function () {
    it('returns a map of resource types', function () {
        const types = getResourceTypes(fakeResourceModel)
        const fakeType = types.get('Type3')
        assert.deepStrictEqual(fakeType?.operations, ['READ', 'LIST'])
        assert.strictEqual(fakeType?.documentation, 'baz')
    })

    it('filters out types not supporting LIST operation', function () {
        const types = getResourceTypes(fakeResourceModel)
        assert.strictEqual(types.size, 2)
        assert.ok(!types.has('Type1'))
    })
})
