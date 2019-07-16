/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as fs from 'fs'
import * as path from 'path'
import { CustomPromisify, promisify } from 'util'

import * as filesystem from '../../shared/filesystem'
import { fileExists, makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { getPropAs } from '../../shared/utilities/tsUtils'

const functionsToTest = [
    'access',
    'readFile',
    'readdir',
    'rename',
    'stat',
    'mkdtemp',
    'unlink',
    'writeFile',
]

describe('filesystem', () => {
    functionsToTest.forEach((fxName: string) => {
        it(`filesystem.${fxName} is same as promisify(fs.${fxName})`, async () => {
            const filesystemFunction = getPropAs<Function>(filesystem, fxName)  // filesystem[fxName]
            const fsFunction = getPropAs<CustomPromisify<Function>>(fs, fxName) // fs[fxName]
            const actualType = typeof filesystemFunction
            assert(
                actualType === 'function',
                `filesystem.${fxName} should be a "function" but is "${actualType}"`
            )
            assert.strictEqual(String(filesystemFunction), String(promisify(fsFunction)))
        })
    })

    describe('mkdir', async () => {
        let tempFolder: string

        beforeEach(async () => {
            // Make a temp folder for all these tests
            tempFolder = await makeTemporaryToolkitFolder()
        })

        afterEach(async () => {
            await del([tempFolder], { force: true })
        })

        it('makes subfolder to existing folder', async () => {
            const dstFolder = path.join(tempFolder, 'level1')
            await filesystem.mkdir(dstFolder, { recursive: true })

            assert.ok(fileExists(dstFolder), 'expected folder to exist')
        })

        it('makes two levels of subfolders', async () => {
            const dstFolder = path.join(tempFolder, 'level1', 'level2')
            await filesystem.mkdir(dstFolder, { recursive: true })

            assert.ok(fileExists(dstFolder), 'expected folder to exist')
        })

        it('makes many levels of subfolders', async () => {
            const dstFolder = path.join(tempFolder, 'level1', 'level2', 'level3', 'level4', 'level5')
            await filesystem.mkdir(dstFolder, { recursive: true })

            assert.ok(fileExists(dstFolder), 'expected folder to exist')
        })
    })
})
