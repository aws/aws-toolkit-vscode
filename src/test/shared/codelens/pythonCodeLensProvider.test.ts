/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getLocalRootVariants } from '../../../shared/utilities/pathUtils'

describe('pythonCodeLensProvider', async function () {
    describe('getLocalRootVariants', async function () {
        if (process.platform === 'win32') {
            const testScenarios = [
                {
                    situation: 'lower case drive letter',
                    inputText: 'c:\\src\\code.js',
                    asLower: 'c:\\src\\code.js',
                    asUpper: 'C:\\src\\code.js',
                },
                {
                    situation: 'upper case drive letter',
                    inputText: 'C:\\src\\code.js',
                    asLower: 'c:\\src\\code.js',
                    asUpper: 'C:\\src\\code.js',
                },
            ]

            testScenarios.forEach(test => {
                it(`Returns cased-drive variants for windows platforms: ${test.situation}`, async () => {
                    const variants = getLocalRootVariants(test.inputText)
                    assert.ok(variants)
                    assert.strictEqual(variants.length, 2, 'Expected two variants')
                    assert.strictEqual(variants[0], test.asLower, 'Unexpected variant text')
                    assert.strictEqual(variants[1], test.asUpper, 'Unexpected variant text')
                })
            })

            it('Returns the same string for network location - windows', async function () {
                const variants = getLocalRootVariants('//share/src/code.js')
                assert.ok(variants)
                assert.strictEqual(variants.length, 1, 'Only expected one variant')
                assert.strictEqual(variants[0], '//share/src/code.js', 'Unexpected variant text')
            })

            it('Returns the same string for weird input - windows', async function () {
                const variants = getLocalRootVariants('src/code.js')
                assert.ok(variants)
                assert.strictEqual(variants.length, 1, 'Only expected one variant')
                assert.strictEqual(variants[0], 'src/code.js', 'Unexpected variant text')
            })
        } else {
            const testScenarios = [
                {
                    situation: 'Looks like a windows path - lower case drive',
                    inputText: 'c:\\src\\code.js',
                },
                {
                    situation: 'Looks like a windows path - upper case drive',
                    inputText: 'C:\\src\\code.js',
                },
                {
                    situation: 'non-windows path',
                    inputText: '/src/code.js',
                },
            ]

            testScenarios.forEach(test => {
                it(`Returns the same string for non-windows platforms: ${test.situation}`, async () => {
                    const variants = getLocalRootVariants(test.inputText)
                    assert.ok(variants)
                    assert.strictEqual(variants.length, 1, 'Only expected one variant')
                    assert.strictEqual(variants[0], test.inputText, 'Unexpected variant text')
                })
            })
        }
    })
})
