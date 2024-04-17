/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import DependencyVersions from '../../../amazonqGumby/models/dependencies'

describe('DependencyVersions', () => {
    describe('length', async () => {
        it('returns the correct number of versions when empty arrays are passed in', async () => {
            const testDependencyVersions = new DependencyVersions('1', [], [])
            assert.strictEqual(testDependencyVersions.length, 1)
        })

        it('returns the correct number of versions when full arrays', async () => {
            const testDependencyVersions = new DependencyVersions('1', ['2', '3'], ['4', '5', '6'])
            assert.strictEqual(testDependencyVersions.length, 6)
        })
    })

    describe('allVersions', async () => {
        it('returns an array with a single member when constructed with empty arrays', async () => {
            const testDependencyVersions = new DependencyVersions('1', [], [])
            assert.deepStrictEqual(testDependencyVersions.allVersions, ['1'])
        })

        it('returns a flat array containing all versions passed in the constructor', async () => {
            const testDependencyVersions = new DependencyVersions('1', ['2', '3'], ['4', '5', '6'])
            assert.deepStrictEqual(testDependencyVersions.allVersions, ['1', '2', '3', '4', '5', '6'])
        })
    })
})
