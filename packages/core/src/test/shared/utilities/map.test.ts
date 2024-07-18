/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { NestedMap } from '../../../shared/utilities/map'

class TestInMemoryMap extends NestedMap<string, { a?: string; b: number }> {
    protected override hash(key: string): string {
        return key
    }
    protected override get name(): string {
        return TestInMemoryMap.name
    }
    override get default(): { a?: string; b: number } {
        return { a: undefined, b: 0 }
    }
}

describe(NestedMap.name, () => {
    it('behaves as expected', () => {
        const map = new TestInMemoryMap()

        // exist() returns false if the key does not exist
        assert.deepStrictEqual(map.has('key1'), false)

        // get() returns the default value if the key does not exist
        assert.deepStrictEqual(map.get('key1'), map.default)

        // set() adds a new key
        map.set('key1', { a: 'key1Value', b: 1 })
        assert.deepStrictEqual(map.has('key1'), true)
        assert.deepStrictEqual(map.get('key1'), { a: 'key1Value', b: 1 })

        // set() updates an existing key
        map.set('key1', { a: 'key1ValueUpdated' })
        assert.deepStrictEqual(map.has('key1'), true)
        assert.deepStrictEqual(map.get('key1'), { a: 'key1ValueUpdated', b: 1 })

        // set() another key
        map.set('key2', { a: 'key2Value', b: 2 })

        // First key still exists and so does the new one
        assert.deepStrictEqual(map.has('key1'), true)
        assert.deepStrictEqual(map.has('key2'), true)
        assert.deepStrictEqual(map.get('key1'), { a: 'key1ValueUpdated', b: 1 })
        assert.deepStrictEqual(map.get('key2'), { a: 'key2Value', b: 2 })

        // clear() removes first key
        map.delete('key1', 'removing for test')
        assert.deepStrictEqual(map.has('key1'), false)
        assert.deepStrictEqual(map.get('key1'), map.default)

        // exist() is still true for the second key
        assert.deepStrictEqual(map.has('key2'), true)
        assert.deepStrictEqual(map.get('key2'), { a: 'key2Value', b: 2 })
    })
})
