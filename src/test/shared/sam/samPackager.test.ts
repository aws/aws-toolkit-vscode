/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as fs from 'fs'
import * as JSZip from 'jszip'
import * as os from 'os'
import * as path from 'path'
import * as filesystem from '../../../shared/filesystem'
import { SamPackager } from '../../../shared/sam/packagers/samPackager'
import { SystemUtilities } from '../../../shared/systemUtilities'

describe('SamPackager', () => {

    let tempFolder: string
    let packageFilename: string

    beforeEach(async () => {
        tempFolder = await filesystem.mkdtempAsync(path.join(os.tmpdir(), 'vsctk-'))
        packageFilename = path.join(tempFolder, 'package.zip')
    })

    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    it('zips a folder', async () => {
        await makeDummyFile('app.js')
        await makeDummyFile('resource/img.jpg')
        await makeDummyFile('node_modules/foo/index.js')

        await new SamPackager()
            .withFolder(tempFolder, '')
            .package(packageFilename)

        assert.equal(await SystemUtilities.fileExists(packageFilename), true)

        const zip: JSZip = new JSZip()
        // tslint:disable-next-line:no-null-keyword
        await zip.loadAsync(await filesystem.readFileAsync(packageFilename, null))

        const zipFiles: Set<string> = new Set(Object.keys(zip.files))
        assert.equal(zipFiles.has('app.js'), true)
        assert.equal(zipFiles.has('resource/img.jpg'), true)
        assert.equal(zipFiles.has('node_modules/foo/index.js'), true)
    })

    it('zips a folder to a subfolder within the zip', async () => {
        await makeDummyFile('app.js')
        await makeDummyFile('resource/img.jpg')
        await makeDummyFile('node_modules/foo/index.js')

        await new SamPackager()
            .withFolder(tempFolder, 'contents')
            .package(packageFilename)

        assert.equal(await SystemUtilities.fileExists(packageFilename), true)

        const zip = new JSZip()
        // tslint:disable-next-line:no-null-keyword
        await zip.loadAsync(await filesystem.readFileAsync(packageFilename, null))

        const zipFiles: Set<string> = new Set(Object.keys(zip.files))
        assert.equal(zipFiles.has('contents/app.js'), true)
        assert.equal(zipFiles.has('contents/resource/img.jpg'), true)
        assert.equal(zipFiles.has('contents/node_modules/foo/index.js'), true)
    })

    it('errs if a file is passed in instead of a folder', async () => {
        await makeDummyFile('app.js')

        const notFolder: string = path.join(tempFolder, 'app.js')

        const err: Error = await assertThrowsError(async () => {
            await new SamPackager()
                .withFolder(notFolder, '')
                .package(packageFilename)
        })

        assert.ok(err)
        assert.notEqual(err.message.indexOf('One or more invalid folders'), -1)
        assert.equal(await SystemUtilities.fileExists(packageFilename), false)
    })

    it('errs if a folder that does not exist is provided', async () => {
        await makeDummyFile('app.js')

        const nonExistentFolder: string = path.join(tempFolder, 'fake-folder')

        const err: Error = await assertThrowsError(async () => {
            await new SamPackager()
                .withFolder(nonExistentFolder, '')
                .package(packageFilename)
        })

        assert.ok(err)
        assert.notEqual(err.message.indexOf('do not exist'), -1)
        assert.equal(await SystemUtilities.fileExists(packageFilename), false)
    })

    // filename is relative to tempFolder
    async function makeDummyFile(filename: string): Promise<void> {
        const fullPath: string = path.join(tempFolder, filename)

        const foldersToCreate: string[] = []

        let parentPath: string = path.parse(fullPath).dir
        while (!fs.existsSync(parentPath)) {
            foldersToCreate.push(parentPath)
            parentPath = path.parse(parentPath).dir
        }

        while (foldersToCreate.length > 0) {
            const folder: string | undefined = foldersToCreate.pop()
            if (!!folder) {
                fs.mkdirSync(folder)
            }
        }

        await filesystem.writeFileAsync(fullPath, 'hello world', 'utf8')
    }

    async function assertThrowsError(fn: () => Thenable<any>): Promise<Error> {
        try {
            await fn()
        } catch (err) {
            if (err instanceof Error) {
                return err
            }
        }

        throw new Error('function did not throw error as expected')
    }
})
