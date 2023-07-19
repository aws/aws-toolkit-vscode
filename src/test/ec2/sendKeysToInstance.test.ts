/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as fs from 'fs-extra'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../shared/filesystemUtilities'
import { generateSshKeys } from '../../ec2/sendKeysToInstance'

describe('generateSshKeys', async function () {
    let temporaryDirectory: string
    before(async function () {
        temporaryDirectory = await makeTemporaryToolkitFolder()
    })

    after(async function () {
        await tryRemoveFolder(temporaryDirectory)
    })

    it('generates key in target file', async function () {
        const keyPath = `${temporaryDirectory}testKey`
        await generateSshKeys(keyPath)
        const contents = await fs.readFile(keyPath, 'utf-8')
        assert.notStrictEqual(contents.length, 0)
    })
})
