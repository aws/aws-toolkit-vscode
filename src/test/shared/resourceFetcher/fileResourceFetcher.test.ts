/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as fs from 'fs-extra'
import { join } from 'path'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { FileResourceFetcher } from '../../../shared/resourcefetcher/fileResourceFetcher'

describe('FileResourceFetcher', async () => {
    let tempFolder: string

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async () => {
        await fs.remove(tempFolder)
    })

    it('loads the contents of a file', async () => {
        const testFile = join(tempFolder, 'file.txt')
        const expectedContents = 'Hello World!\n12345'

        await fs.writeFile(testFile, expectedContents)

        const sut = new FileResourceFetcher(testFile)

        const contents = await sut.get()

        assert.strictEqual(contents, expectedContents)
    })

    it('returns undefined if the file does not exist', async () => {
        const sut = new FileResourceFetcher(join(tempFolder, 'somefile'))

        const contents = await sut.get()

        assert.strictEqual(contents, undefined)
    })
})
