/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import DependencyVersions from '../../../amazonqGumby/models/dependencies'

describe('DependencyVersions', () => {
    describe('length', async () => {
        it('returns the correct number of versions when empty arrays are passed in', async () => {
            const testDependencyVersions = new DependencyVersions('', [], [], '1')
            assert.strictEqual(testDependencyVersions.length, 0)
        })

        it('returns the correct number of versions when full arrays', async () => {
            const testDependencyVersions = new DependencyVersions('1', ['1', '2', '3'], ['4', '5', '6'], '1')
            assert.strictEqual(testDependencyVersions.length, 6)
        })

        it('ignores duplicates when calculating the length', async () => {
            const testDependencyVersions = new DependencyVersions('1', ['1', '2'], ['1', '3', '4'], '1')
            assert.strictEqual(testDependencyVersions.length, 4)
        })
    })

    describe('allVersions', async () => {
        it('returns an empty array when constructed with empty arrays', async () => {
            const testDependencyVersions = new DependencyVersions('1', [], [], '1')
            assert.deepStrictEqual(Array.from(testDependencyVersions.allVersions), [])
        })

        it('returns a flat array containing all versions passed in the constructor', async () => {
            const testDependencyVersions = new DependencyVersions('1', ['1', '2', '3'], ['4', '5', '6'], '1')
            assert.deepStrictEqual(Array.from(testDependencyVersions.allVersions), ['1', '2', '3', '4', '5', '6'])
        })

        it('returns an array containing only unique members', async () => {
            const testDependencyVersions = new DependencyVersions('1', ['1', '2'], ['1', '2', '3'], '1')
            assert.deepStrictEqual(Array.from(testDependencyVersions.allVersions), ['1', '2', '3'])
        })

        it('returns an array where major versions are sorted in ascending order, followed by minor versions', async () => {
            const testDependencyVersions = new DependencyVersions('4.4', ['4.4', '3.2'], ['1.1', '1.3', '1.2'], '1')
            assert.deepStrictEqual(Array.from(testDependencyVersions.allVersions), ['3.2', '4.4', '1.1', '1.2', '1.3'])
        })
    })
})
