/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as fs from 'fs'
import { CustomPromisify, promisify } from 'util'

import * as filesystem from '../../shared/filesystem'
import { getPropAs } from '../../shared/utilities/tsUtils'

const functionsToTest = [
    'access',
    'readFile',
    'readdir',
    'rename',
    'stat',
    'mkdir',
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
})
