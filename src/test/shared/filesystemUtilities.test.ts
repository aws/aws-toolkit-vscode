/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as os from 'os'
import * as del from 'del'
import { writeFile } from 'fs-extra'
import * as path from 'path'
import { mkdir } from '../../shared/filesystem'
import {
    fileExists,
    findFileInParentPaths,
    isInDirectory,
    makeTemporaryToolkitFolder,
    tempDirPath,
} from '../../shared/filesystemUtilities'

describe('filesystemUtilities', () => {
    const targetFilename = 'findThisFile12345.txt'
    let targetFilePath: string
    const nonExistingTargetFilename = 'doNotFindThisFile12345.txt'
    let tempFolder: string
    const foldersToCleanUp: string[] = []

    beforeEach(async () => {
        // Make a temp folder for all these tests
        tempFolder = await makeTemporaryToolkitFolder()
        targetFilePath = path.join(tempFolder, targetFilename)

        await writeFile(targetFilePath, 'Hello, World!', 'utf8')

        foldersToCleanUp.push(tempFolder)
    })

    afterEach(async () => {
        await del(foldersToCleanUp, { force: true })
    })

    describe('makeTemporaryToolkitFolder', () => {
        it(`makes temp dirs as children to filesystemUtilities.tempDirPath ('${tempDirPath}')`, async () => {
            const parentFolder = path.dirname(tempFolder)

            assert.strictEqual(
                parentFolder,
                tempDirPath,
                `expected tempFolder ('${tempFolder}') to be in tempDirPath ('${tempDirPath}')`
            )
        })

        it('creates a folder', async () => {
            assert.ok(await fileExists(tempFolder), `expected folder to exist: ${tempFolder}`)
        })

        it('makes nested temp dirs', async () => {
            const nestedTempDirPath = await makeTemporaryToolkitFolder('nestedSubfolder', 'moreNestedSubfolder')

            foldersToCleanUp.push(nestedTempDirPath)
            foldersToCleanUp.push(path.join(tempDirPath, 'nestedSubfolder'))

            assert(
                nestedTempDirPath.startsWith(tempDirPath),
                `expected nestedTempDirPath ('${nestedTempDirPath}') to be in tempDirPath ('${tempDirPath}')`
            )
            const tmpDirExists = await fileExists(nestedTempDirPath)
            assert(tmpDirExists, `tempFolder should exist: '${nestedTempDirPath}'`)
        })
    })

    describe('findFileInParentPaths', () => {
        it('returns undefined when file not found', async () => {
            assert.strictEqual(await findFileInParentPaths(tempFolder, nonExistingTargetFilename), undefined)
        })

        it('finds the file in the same folder', async () => {
            assert.strictEqual(await findFileInParentPaths(tempFolder, targetFilename), targetFilePath)
        })

        it('finds the file next to another file', async () => {
            const searchLocation = path.join(tempFolder, 'foo.txt')

            assert.strictEqual(await findFileInParentPaths(searchLocation, targetFilename), targetFilePath)
        })

        it('finds the file in the parent folder', async () => {
            const childFolder = path.join(tempFolder, 'child1')
            await mkdir(childFolder)

            assert.strictEqual(await findFileInParentPaths(childFolder, targetFilename), targetFilePath)
        })

        it('finds the file 3 parent folders up', async () => {
            let childFolder = path.join(tempFolder, 'child1')
            await mkdir(childFolder)
            childFolder = path.join(tempFolder, 'child2')
            await mkdir(childFolder)
            childFolder = path.join(tempFolder, 'child3')
            await mkdir(childFolder)

            assert.strictEqual(await findFileInParentPaths(childFolder, targetFilename), targetFilePath)
        })
    })

    it('isInDirectory()', () => {
        const basePath = path.join('this', 'is', 'the', 'way')
        const extendedPath = path.join(basePath, 'forward')
        const filename = 'yadayadayada.log'

        assert.ok(isInDirectory(basePath, basePath))
        assert.ok(isInDirectory(basePath, extendedPath))
        assert.ok(isInDirectory(basePath, path.join(basePath, filename)))
        assert.ok(isInDirectory(basePath, path.join(extendedPath, filename)))
        assert.ok(!isInDirectory(basePath, path.join('what', 'are', 'you', 'looking', 'at')))
        assert.ok(!isInDirectory(basePath, `${basePath}point`))
        assert.ok(isInDirectory('/foo/bar/baz/', '/foo/bar/baz/a.txt'))
        assert.ok(isInDirectory('/foo/bar/baz/', ''))
        assert.ok(isInDirectory('/', ''))
        assert.ok(isInDirectory('', 'foo'))
        assert.ok(isInDirectory('foo', 'foo'))

        if (os.platform() === 'win32') {
            assert.ok(isInDirectory('/foo/bar/baz/', '/FOO/BAR/BAZ/A.TXT'))
            assert.ok(isInDirectory('C:\\foo\\bar\\baz\\', 'C:/FOO/BAR/BAZ/A.TXT'))
            assert.ok(isInDirectory('C:\\foo\\bar\\baz', 'C:\\foo\\bar\\baz\\a.txt'))
        } else {
            assert.ok(!isInDirectory('/foo/bar/baz/', '/FOO/BAR/BAZ/A.TXT'))
        }
    })
})
