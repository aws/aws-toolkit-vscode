/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as path from 'path'
import { existsSync, mkdirSync, promises as fsPromises, readFileSync, rmSync, writeFileSync } from 'fs'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { fsCommon } from '../../srcShared/fs'
import * as os from 'os'
import { isMinimumVersion } from '../../shared/vscode/env'
import Sinon from 'sinon'
import * as extensionUtilities from '../../shared/extensionUtilities'

function isWin() {
    return os.platform() === 'win32'
}

describe('FileSystem', function () {
    let fakeContext: vscode.ExtensionContext
    let sandbox: Sinon.SinonSandbox

    before(async function () {
        fakeContext = await FakeExtensionContext.create()
        sandbox = Sinon.createSandbox()
        await deleteTestRoot() // incase a previous test run failed to clean
    })

    beforeEach(async function () {
        await makeTestRoot()
    })

    afterEach(async function () {
        await deleteTestRoot()
        sandbox.restore()
    })

    describe('readFileAsString()', function () {
        it('reads a file', async function () {
            const path = await makeFile('test.txt', 'hello world')
            const pathAsUri = vscode.Uri.file(path)

            assert.strictEqual(await fsCommon.readFileAsString(path), 'hello world')
            assert.strictEqual(await fsCommon.readFileAsString(pathAsUri), 'hello world')
        })

        it('throws when no permissions', async function () {
            if (isWin()) {
                console.log('Skipping since windows does not support mode permissions')
                return this.skip()
            }

            const fileName = 'test.txt'
            const path = await makeFile(fileName, 'hello world', { mode: 0o000 })

            await assert.rejects(fsCommon.readFileAsString(path), err => {
                assert(err instanceof vscode.FileSystemError)
                assert.strictEqual(err.code, 'NoPermissions')
                assert(err.message.includes(fileName))
                return true
            })
        })
    })

    describe('writeFile()', function () {
        it('writes a file', async function () {
            const filePath = createTestPath('myFileName')
            await fsCommon.writeFile(filePath, 'MyContent')
            assert.strictEqual(readFileSync(filePath, 'utf-8'), 'MyContent')
        })

        it('writes a file with encoded text', async function () {
            const filePath = createTestPath('myFileName')
            const text = 'hello'
            const content = new TextEncoder().encode(text)

            await fsCommon.writeFile(filePath, content)

            assert.strictEqual(readFileSync(filePath, 'utf-8'), text)
        })

        it('makes dirs if missing', async function () {
            const filePath = createTestPath('dirA/dirB/myFileName.txt')
            await fsCommon.writeFile(filePath, 'MyContent')
            assert.strictEqual(readFileSync(filePath, 'utf-8'), 'MyContent')
        })

        it('throws when existing file + no permission', async function () {
            if (isWin()) {
                console.log('Skipping since windows does not support mode permissions')
                return this.skip()
            }
            if (isMinimumVersion()) {
                console.log('Skipping since min version has different error message')
                return this.skip()
            }

            const fileName = 'test.txt'
            const filePath = await makeFile(fileName, 'hello world', { mode: 0o000 })

            await assert.rejects(fsCommon.writeFile(filePath, 'MyContent'), err => {
                assert(err instanceof vscode.FileSystemError)
                assert.strictEqual(err.name, 'EntryWriteLocked (FileSystemError) (FileSystemError)')
                assert(err.message.includes(fileName))
                return true
            })
        })
    })

    describe('appendFile()', function () {
        it('appends to a file', async function () {
            const filePath = await makeFile('test.txt', 'LINE-1-TEXT')
            await fsCommon.appendFile(filePath, '\nLINE-2-TEXT')
            assert.strictEqual(readFileSync(filePath, 'utf-8'), 'LINE-1-TEXT\nLINE-2-TEXT')
        })

        it('creates new file if it does not exist', async function () {
            const filePath = createTestPath('thisDoesNotExist.txt')
            await fsCommon.appendFile(filePath, 'i am nikolas')
            assert.strictEqual(readFileSync(filePath, 'utf-8'), 'i am nikolas')
        })
    })

    describe('existsFile()', function () {
        it('returns true for an existing file', async function () {
            const filePath = await makeFile('test.txt')
            const existantFile = await fsCommon.existsFile(filePath)
            assert.strictEqual(existantFile, true)
        })

        it('returns false for a non-existant file', async function () {
            const nonExistantFile = await fsCommon.existsFile(createTestPath('thisDoesNotExist.txt'))
            assert.strictEqual(nonExistantFile, false)
        })

        it('returns false when directory with same name exists', async function () {
            const directoryPath = await makeFolder('thisIsDirectory')
            const existantFile = await fsCommon.existsFile(directoryPath)
            assert.strictEqual(existantFile, false)
        })
    })

    describe('existsDir()', function () {
        it('returns true for an existing directory', async function () {
            const dirPath = await makeFolder('myDir')
            const existantDirectory = await fsCommon.existsDir(dirPath)
            assert.strictEqual(existantDirectory, true)
        })

        it('returns false for a non-existant directory', async function () {
            const nonExistantDirectory = await fsCommon.existsDir(createTestPath('thisDirDoesNotExist'))
            assert.strictEqual(nonExistantDirectory, false)
        })
    })

    describe('mkdir()', function () {
        const paths = ['a', 'a/b', 'a/b/c', 'a/b/c/d/']

        paths.forEach(async function (p) {
            it(`creates folder: '${p}'`, async function () {
                const dirPath = createTestPath(p)
                await fsCommon.mkdir(dirPath)
                assert(existsSync(dirPath))
            })
        })

        paths.forEach(async function (p) {
            it(`creates folder but uses the "fs" module if in C9: '${p}'`, async function () {
                sandbox.stub(extensionUtilities, 'isCloud9').returns(true)
                const mkdirSpy = sandbox.spy(fsPromises, 'mkdir')
                const dirPath = createTestPath(p)

                await fsCommon.mkdir(dirPath)

                assert(existsSync(dirPath))
                assert.strictEqual(mkdirSpy.callCount, 1)
            })
        })
    })

    describe('readdir()', function () {
        it('lists files in a directory', async function () {
            await makeFile('a.txt')
            await makeFile('b.txt')
            await makeFile('c.txt')
            mkdirSync(createTestPath('dirA'))
            mkdirSync(createTestPath('dirB'))
            mkdirSync(createTestPath('dirC'))

            const files = await fsCommon.readdir(testRootPath())
            assert.deepStrictEqual(
                sorted(files),
                sorted([
                    ['a.txt', vscode.FileType.File],
                    ['b.txt', vscode.FileType.File],
                    ['c.txt', vscode.FileType.File],
                    ['dirA', vscode.FileType.Directory],
                    ['dirB', vscode.FileType.Directory],
                    ['dirC', vscode.FileType.Directory],
                ])
            )
        })

        it('empty list if no files in directory', async function () {
            const files = await fsCommon.readdir(testRootPath())
            assert.deepStrictEqual(files, [])
        })

        function sorted(i: [string, vscode.FileType][]) {
            return i.sort((a, b) => a[0].localeCompare(b[0]))
        }

        it('uses the "fs" readdir implementation if in C9', async function () {
            sandbox.stub(extensionUtilities, 'isCloud9').returns(true)
            const readdirSpy = sandbox.spy(fsPromises, 'readdir')

            await makeFile('a.txt')
            await makeFile('b.txt')
            await makeFile('c.txt')
            mkdirSync(createTestPath('dirA'))
            mkdirSync(createTestPath('dirB'))
            mkdirSync(createTestPath('dirC'))

            const files = await fsCommon.readdir(testRootPath())
            assert.deepStrictEqual(
                sorted(files),
                sorted([
                    ['a.txt', vscode.FileType.File],
                    ['b.txt', vscode.FileType.File],
                    ['c.txt', vscode.FileType.File],
                    ['dirA', vscode.FileType.Directory],
                    ['dirB', vscode.FileType.Directory],
                    ['dirC', vscode.FileType.Directory],
                ])
            )
            assert.ok(readdirSpy.calledOnce)
        })
    })

    describe('delete()', function () {
        it('deletes a file', async function () {
            const filePath = await makeFile('test.txt', 'hello world')
            await fsCommon.delete(filePath)
            assert.ok(!existsSync(filePath))
        })

        it('deletes a directory', async function () {
            const dirPath = createTestPath('dirToDelete')
            mkdirSync(dirPath)

            await fsCommon.delete(dirPath)

            assert.ok(!existsSync(dirPath))
        })

        it('uses the "fs" rm method if in C9', async function () {
            sandbox.stub(extensionUtilities, 'isCloud9').returns(true)
            const rmdirSpy = sandbox.spy(fsPromises, 'rm')
            // Folder with subfolders
            const dirPath = await makeFolder('a/b/deleteMe')

            mkdirSync(dirPath, { recursive: true })

            await fsCommon.delete(dirPath)

            assert.ok(!existsSync(dirPath))
            assert.ok(rmdirSpy.calledOnce)
        })
    })

    describe('stat()', function () {
        it('gets stat of a file', async function () {
            const filePath = await makeFile('test.txt', 'hello world')
            const stat = await fsCommon.stat(filePath)
            assert.ok(stat)
            assert.strictEqual(stat.type, vscode.FileType.File)
        })

        it('throws if no file exists', async function () {
            const filePath = createTestPath('thisDoesNotExist.txt')
            await assert.rejects(() => fsCommon.stat(filePath))
        })
    })

    async function makeFile(relativePath: string, content?: string, options?: { mode?: number }): Promise<string> {
        const filePath = path.join(testRootPath(), relativePath)
        writeFileSync(filePath, content ?? '', { mode: options?.mode })
        return filePath
    }

    async function makeFolder(relativeFolderPath: string) {
        const folderPath = path.join(testRootPath(), relativeFolderPath)
        mkdirSync(folderPath, { recursive: true })
        return folderPath
    }

    function createTestPath(relativePath: string): string {
        return path.join(testRootPath(), relativePath)
    }

    function testRootPath() {
        return path.join(fakeContext.globalStorageUri.fsPath, 'fsTestDir')
    }

    async function makeTestRoot() {
        return mkdirSync(testRootPath())
    }

    async function deleteTestRoot() {
        rmSync(testRootPath(), { recursive: true, force: true })
    }
})
