/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import './vscode/initialize'

import * as assert from 'assert'
import * as del from 'del'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as filesystem from '../../shared/filesystem'
import * as filesystemUtilities from '../../shared/filesystemUtilities'

describe('filesystemUtilities', () => {
    const targetFilename = 'findThisFile12345.txt'
    let targetFilePath: string
    const nonExistingTargetFilename = 'doNotFindThisFile12345.txt'
    let tempFolder: string

    beforeEach(async () => {
        // Make a temp folder for all these tests
        tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'vsctk'))
        targetFilePath = path.join(tempFolder, targetFilename)

        await filesystem.writeFileAsync(targetFilePath, 'Hello, World!', 'utf8')
    })

    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    describe('findFileInParentPaths', () => {

        it('returns undefined when file not found', async () => {
            assert.strictEqual(
                await filesystemUtilities.findFileInParentPaths(tempFolder, nonExistingTargetFilename),
                undefined)
        })

        it('finds the file in the same folder', async () => {
            assert.strictEqual(
                await filesystemUtilities.findFileInParentPaths(tempFolder, targetFilename),
                targetFilePath)
        })

        it('finds the file next to another file', async () => {
            const searchLocation = path.join(tempFolder, 'foo.txt')

            assert.strictEqual(
                await filesystemUtilities.findFileInParentPaths(searchLocation, targetFilename),
                targetFilePath)
        })

        it('finds the file in the parent folder', async () => {
            const childFolder = path.join(tempFolder, 'child1')
            await filesystem.mkdirAsync(childFolder)

            assert.strictEqual(
                await filesystemUtilities.findFileInParentPaths(childFolder, targetFilename),
                targetFilePath)
        })

        it('finds the file 3 parent folders up', async () => {
            let childFolder = path.join(tempFolder, 'child1')
            await filesystem.mkdirAsync(childFolder)
            childFolder = path.join(tempFolder, 'child2')
            await filesystem.mkdirAsync(childFolder)
            childFolder = path.join(tempFolder, 'child3')
            await filesystem.mkdirAsync(childFolder)

            assert.strictEqual(
                await filesystemUtilities.findFileInParentPaths(childFolder, targetFilename),
                targetFilePath)
        })
    })
})
