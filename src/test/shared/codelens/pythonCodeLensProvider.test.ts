/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import { getLocalRootVariants } from '../../../shared/utilities/pathUtils'
import { makeTemporaryToolkitFolder, readFileAsString } from '../../../shared/filesystemUtilities'
import { rmrf } from '../../../shared/filesystem'
import { makeLambdaDebugFile } from '../../../shared/sam/debugger/pythonSamDebug'

describe('pythonCodeLensProvider', async () => {
    describe('getLocalRootVariants', async () => {
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

            it('Returns the same string for network location - windows', async () => {
                const variants = getLocalRootVariants('//share/src/code.js')
                assert.ok(variants)
                assert.strictEqual(variants.length, 1, 'Only expected one variant')
                assert.strictEqual(variants[0], '//share/src/code.js', 'Unexpected variant text')
            })

            it('Returns the same string for weird input - windows', async () => {
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

    describe('makeLambdaDebugFile', async () => {
        let dir: string
        const debugPort = 1357
        const fileSuffix = `___vsctk___debug`
        const defaultFnName = 'lambda_handler'

        beforeEach(async () => {
            dir = await makeTemporaryToolkitFolder()
        })

        afterEach(async () => {
            await rmrf(dir)
        })

        it('handles a handler in the same dir (one period)', async () => {
            await runDebugFileTests({
                filepath: 'hands',
                handler: 'off',
            })
        })

        it('handles a handler in a nested dir (multiple periods)', async () => {
            await runDebugFileTests({
                filepath: 'take.a.look.at.these',
                handler: 'hands',
            })
        })

        async function runDebugFileTests({ filepath, handler }: { filepath: string; handler: string }) {
            const handlerName = `${filepath}.${handler}`
            const debugHandlerFileName = `${filepath.split('.').join('_')}${fileSuffix}`
            const result = await makeLambdaDebugFile({
                handlerName,
                outputDir: dir,
                debugPort,
            })
            assert.strictEqual(result.debugHandlerName, `${debugHandlerFileName}.${defaultFnName}`)
            const outFile = path.join(dir, `${debugHandlerFileName}.py`)
            assert.strictEqual(result.outFilePath, outFile)
            const fileContents = await readFileAsString(outFile)
            assert.ok(fileContents.includes(`from ${filepath} import ${handler} as _handler`))
        }
    })
})
