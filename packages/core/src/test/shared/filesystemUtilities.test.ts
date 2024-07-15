/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as os from 'os'
import { writeFile, remove } from 'fs-extra'
import * as path from 'path'
import {
    fileExists,
    getFileDistance,
    getNonexistentFilename,
    isInDirectory,
    makeTemporaryToolkitFolder,
    neighborFiles,
    tempDirPath,
} from '../../shared/filesystemUtilities'
import { createTestWorkspaceFolder, toFile } from '..'

describe('filesystemUtilities', function () {
    const targetFilename = 'findThisFile12345.txt'
    let targetFilePath: string
    let tempFolder: string
    const foldersToCleanUp: string[] = []

    beforeEach(async function () {
        // Make a temp folder for all these tests
        tempFolder = await makeTemporaryToolkitFolder()
        targetFilePath = path.join(tempFolder, targetFilename)

        await writeFile(targetFilePath, 'Hello, World!', 'utf8')

        foldersToCleanUp.push(tempFolder)
    })

    afterEach(async function () {
        for (const folder of foldersToCleanUp) {
            await remove(folder)
        }
    })

    describe('getNonexistentFilename()', function () {
        it(`failure modes`, async function () {
            await assert.rejects(async () => getNonexistentFilename('/bogus/directory/', 'foo', '.txt', 99))
            await assert.rejects(async () => getNonexistentFilename('zzz', 'foo', '.txt', 99))
        })
        it(`returns a filename that does not exist in the directory`, async function () {
            const dir = tempFolder
            await writeFile(path.join(dir, 'foo.txt'), '', 'utf8')
            await writeFile(path.join(dir, 'foo-0.txt'), '', 'utf8')
            await writeFile(path.join(dir, 'foo-1.txt'), '', 'utf8')
            await writeFile(path.join(dir, 'foo-2.txt'), '', 'utf8')
            assert.strictEqual(await getNonexistentFilename(dir, 'foo', '.txt', 99), 'foo-3.txt')
            assert.strictEqual(await getNonexistentFilename(dir, 'foo', '', 99), 'foo')
        })
        it(`returns "foo-RANDOM.txt" if max is reached`, async function () {
            const dir = tempFolder
            await writeFile(path.join(dir, 'foo.txt'), '', 'utf8')
            await writeFile(path.join(dir, 'foo-1.txt'), '', 'utf8')
            // Looks like "foo-75446d5d.txt".
            assert.ok(/^foo-[a-fA-F0-9]{8}.txt$/.test(await getNonexistentFilename(dir, 'foo', '.txt', 1)))
        })
    })

    describe('makeTemporaryToolkitFolder()', function () {
        it(`makes temp dirs as children to filesystemUtilities.tempDirPath ('${tempDirPath}')`, async () => {
            const parentFolder = path.dirname(tempFolder)

            assert.strictEqual(
                parentFolder,
                tempDirPath,
                `expected tempFolder ('${tempFolder}') to be in tempDirPath ('${tempDirPath}')`
            )
        })

        it('creates a folder', async function () {
            assert.ok(await fileExists(tempFolder), `expected folder to exist: ${tempFolder}`)
        })

        it('makes nested temp dirs', async function () {
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

    it('isInDirectory()', function () {
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

    describe('getFileDistance', function () {
        let fileA: string
        let fileB: string

        it('distance 0', function () {
            fileA = 'foo/bar/a.java'
            fileB = 'foo/bar/b.java'
            const actual = getFileDistance(fileA, fileB)
            assert.strictEqual(actual, 0)
        })

        it('root distance 0', function () {
            fileA = 'a.txt'
            fileB = 'b.txt'
            const actual = getFileDistance(fileA, fileB)
            assert.strictEqual(actual, 0)
        })

        it('distance 1', function () {
            fileA = 'foo/bar/a.java'
            fileB = 'foo/b.java'
            const actual = getFileDistance(fileA, fileB)
            assert.strictEqual(actual, 1)
        })

        it('distance 3', function () {
            fileA = 'foo/bar/a.java'
            fileB = 'lzz/b.java'
            const actual = getFileDistance(fileA, fileB)
            assert.strictEqual(actual, 3)
        })

        it('distance 4', function () {
            fileA = 'foo/bar/a.java'
            fileB = 'lzz/baz/b.java'
            const actual = getFileDistance(fileA, fileB)
            assert.strictEqual(actual, 4)
        })

        it('another distance 4', function () {
            fileA = 'foo/a.py'
            fileB = 'foo/foo/foo/foo/foo/b.py'
            const actual = getFileDistance(fileA, fileB)
            assert.strictEqual(actual, 4)
        })

        it('distance 5', function () {
            fileA = 'foo/bar/a.java'
            fileB = 'lzz/baz/zoo/b.java'
            const actual = getFileDistance(fileA, fileB)
            assert.strictEqual(actual, 5)
        })

        it('distance 6', function () {
            fileA = 'foo/zoo/a.java'
            fileB = 'bar/baz/bee/bww/b.java'
            const actual = getFileDistance(fileA, fileB)
            assert.strictEqual(actual, 6)
        })

        it('backslash distance 1', function () {
            fileA = 'C:\\FOO\\BAR\\BAZ\\A.TXT'
            fileB = 'C:\\FOO\\BAR\\B.TXT'
            const actual = getFileDistance(fileA, fileB)
            assert.strictEqual(actual, 1)
        })

        it('backslash distnace 3', function () {
            fileA = 'C:\\FOO\\BAR\\BAZ\\LOO\\WOW\\A.txt'
            fileB = 'C:\\FOO\\BAR\\B.txt'
            const actual = getFileDistance(fileA, fileB)
            assert.strictEqual(actual, 3)
        })
    })

    /**
     *     1. A: root/util/context/a.ts
     *     2. B: root/util/b.ts
     *     3. C: root/util/service/c.ts
     *     4. D: root/d.ts
     *     5. E: root/util/context/e.ts
     *     6. F: root/util/foo/bar/baz/f.ts
     *
     *   neighborfiles(A) = [B, E]
     *   neighborfiles(B) = [A, C, D, E]
     *   neighborfiles(C) = [B,]
     *   neighborfiles(D) = [B,]
     *   neighborfiles(E) = [A, B]
     *   neighborfiles(F) = []
     *
     *      A B C D E F
     *   A  x 1 2 2 0 4
     *   B  1 x 1 1 1 3
     *   C  2 1 x 2 2 4
     *   D  2 1 2 x 2 4
     *   E  0 1 2 2 x 4
     *   F  4 3 4 4 4 x
     */
    describe('neighborFiles', function () {
        it('return files with distance less than or equal to 1', async function () {
            const ws = await createTestWorkspaceFolder('root')
            const rootUri = ws.uri.fsPath
            foldersToCleanUp.push(rootUri)
            const a = path.join(rootUri, 'util', 'context', 'a.java')
            const b = path.join(rootUri, 'util', 'b.java')
            const c = path.join(rootUri, 'util', 'service', 'c.java')
            const d = path.join(rootUri, 'd.java')
            const e = path.join(rootUri, 'util', 'context', 'e.java')
            const f = path.join(rootUri, 'util', 'foo', 'bar', 'baz', 'f.java')

            await toFile('a', a)
            await toFile('b', b)
            await toFile('c', c)
            await toFile('d', d)
            await toFile('e', e)
            await toFile('f', f)

            const neighborOfA = await neighborFiles(a, { workspaceFolders: [ws] })
            const neighborOfB = await neighborFiles(b, { workspaceFolders: [ws] })
            const neighborOfC = await neighborFiles(c, { workspaceFolders: [ws] })
            const neighborOfD = await neighborFiles(d, { workspaceFolders: [ws] })
            const neighborOfE = await neighborFiles(e, { workspaceFolders: [ws] })
            const neighborOfF = await neighborFiles(f, { workspaceFolders: [ws] })

            assert.deepStrictEqual(neighborOfA, new Set([b, e]))
            assert.strictEqual(getFileDistance(a, b), 1)
            assert.strictEqual(getFileDistance(a, e), 0)

            assert.deepStrictEqual(neighborOfB, new Set([a, c, d, e]))
            assert.strictEqual(getFileDistance(b, c), 1)
            assert.strictEqual(getFileDistance(b, d), 1)
            assert.strictEqual(getFileDistance(b, e), 1)

            assert.deepStrictEqual(neighborOfC, new Set([b]))
            assert.deepStrictEqual(neighborOfD, new Set([b]))
            assert.deepStrictEqual(neighborOfE, new Set([a, b]))

            assert.deepStrictEqual(neighborOfF, new Set([]))
            assert.strictEqual(getFileDistance(f, a), 4)
            assert.strictEqual(getFileDistance(f, b), 3)
            assert.strictEqual(getFileDistance(f, c), 4)
            assert.strictEqual(getFileDistance(f, d), 4)
            assert.strictEqual(getFileDistance(f, e), 4)
        })
    })
})
