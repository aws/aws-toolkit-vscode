/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { writeFile } from 'fs-extra'
import * as path from 'path'
import { mkdir, rmrf } from '../../shared/filesystem'
import { fileExists, makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'

describe('filesystem', () => {
    describe('mkdir', async () => {
        let tempFolder: string

        beforeEach(async () => {
            // Make a temp folder for all these tests
            tempFolder = await makeTemporaryToolkitFolder()
        })

        afterEach(async () => {
            await rmrf(tempFolder)
        })

        it('makes subfolder to existing folder', async () => {
            const dstFolder = path.join(tempFolder, 'level1')
            await mkdir(dstFolder, { recursive: true })

            assert.ok(await fileExists(dstFolder), 'expected folder to exist')
        })

        it('makes two levels of subfolders', async () => {
            const dstFolder = path.join(tempFolder, 'level1', 'level2')
            await mkdir(dstFolder, { recursive: true })

            assert.ok(await fileExists(dstFolder), 'expected folder to exist')
        })

        it('makes many levels of subfolders', async () => {
            const dstFolder = path.join(tempFolder, 'level1', 'level2', 'level3', 'level4', 'level5')
            await mkdir(dstFolder, { recursive: true })

            assert.ok(await fileExists(dstFolder), 'expected folder to exist')
        })
    })

    describe('rmrf', async () => {
        it('deletes files and folders recursively', async () => {
            const tempFolder = await makeTemporaryToolkitFolder()
            const folder = path.join(tempFolder, 'level1')
            await mkdir(folder, { recursive: true })
            await writeFile(path.join(folder, 'template.yaml'), '')
            await rmrf(tempFolder)
            assert.ok(!(await fileExists(path.join(folder, 'template.yaml'))), 'expected file to be deleted')
            assert.ok(!(await fileExists(folder)), 'expected folder to be deleted')
        })
    })
})
