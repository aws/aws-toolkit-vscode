/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as path from 'path'
import { existsSync, mkdirSync, promises as nodefs, readFileSync, rmSync } from 'fs'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { fsCommon } from '../../srcShared/fs'
import * as os from 'os'
import { isMinVscode } from '../../shared/vscode/env'
import Sinon from 'sinon'
import * as extensionUtilities from '../../shared/extensionUtilities'
import { toFile } from '../testUtil'
import { PermissionsError } from '../../shared/errors'

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
        await mkTestRoot()
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
                assert(err instanceof PermissionsError)
                assert.strictEqual(err.code, 'InvalidPermissions')
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
            if (isMinVscode()) {
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
        it('true for existing file', async function () {
            const file = await makeFile('test.txt')
            assert.strictEqual(await fsCommon.existsFile(file), true)
        })

        it('false for non-existent file', async function () {
            const nonExistantFile = createTestPath('thisDoesNotExist.txt')
            assert.strictEqual(await fsCommon.existsFile(nonExistantFile), false)
        })

        it('false for existing directory', async function () {
            const dir = mkTestDir('thisIsDirectory')
            assert.strictEqual(await fsCommon.existsFile(dir), false)
        })
    })

    describe('existsDir()', function () {
        it('true for existing directory', async function () {
            const dir = mkTestDir('myDir')
            assert.strictEqual(await fsCommon.existsDir(dir), true)
        })

        it('false for non-existent directory', async function () {
            const noFile = createTestPath('non-existent')
            assert.strictEqual(await fsCommon.existsDir(noFile), false)
        })
    })

    describe('exists()', function () {
        it('true for existing file/directory', async function () {
            const dir = mkTestDir('myDir')
            const file = await makeFile('test.txt')
            assert.strictEqual(await fsCommon.exists(dir), true)
            assert.strictEqual(await fsCommon.exists(file), true)
        })

        it('false for non-existent file/directory', async function () {
            const noFile = createTestPath('non-existent')
            assert.strictEqual(await fsCommon.exists(noFile), false)
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
            it(`creates folder but uses the "fs" module if in Cloud9: '${p}'`, async function () {
                sandbox.stub(extensionUtilities, 'isCloud9').returns(true)
                const dirPath = createTestPath(p)
                const mkdirSpy = sandbox.spy(nodefs, 'mkdir')

                await fsCommon.mkdir(dirPath)

                assert(existsSync(dirPath))
                assert.deepStrictEqual(mkdirSpy.args[0], [dirPath, { recursive: true }])
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

        it('uses the "fs" readdir implementation if in Cloud9', async function () {
            sandbox.stub(extensionUtilities, 'isCloud9').returns(true)
            const readdirSpy = sandbox.spy(nodefs, 'readdir')

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
            assert(readdirSpy.calledOnce)
        })
    })

    describe('copy()', function () {
        it('copies files and folders from one dir to another', async function () {
            const targetDir = mkTestDir('targetDir')
            await makeFile('targetDir/a.txt', 'I am A')
            await makeFile('targetDir/dirB/b.txt', 'I am B')

            const destDir = path.join(testRootPath(), 'destDir')
            await fsCommon.copy(targetDir, destDir)

            assert.strictEqual(await fsCommon.readFileAsString(path.join(destDir, 'a.txt')), 'I am A')
            assert.strictEqual(await fsCommon.readFileAsString(path.join(destDir, 'dirB/b.txt')), 'I am B')
        })
    })

    describe('delete()', function () {
        it('deletes file', async function () {
            const f = await makeFile('test.txt', 'hello world')
            assert(existsSync(f))
            await fsCommon.delete(f)
            assert(!existsSync(f))
        })

        it('fails to delete non-empty directory with recursive:false (the default)', async function () {
            const dir = mkTestDir()
            const f = path.join(dir, 'testfile.txt')
            await toFile('some content', f)
            assert(existsSync(dir))
            await assert.rejects(() => fsCommon.delete(dir), /not empty|non-empty/)
            assert(existsSync(dir))
        })

        it('deletes directory with recursive:true', async function () {
            const dir = mkTestDir()
            await fsCommon.delete(dir, { recursive: true })
            assert(!existsSync(dir))
        })

        it('no error if file not found (but parent exists)', async function () {
            const dir = mkTestDir()
            const f = path.join(dir, 'missingfile.txt')
            assert(!existsSync(f))
            await fsCommon.delete(f)
        })

        it('error if file *and* its parent dir not found', async function () {
            const dir = mkTestDir()
            const f = path.join(dir, 'missingdir/missingfile.txt')
            assert(!existsSync(f))
            await assert.rejects(() => fsCommon.delete(f))
        })

        it('uses "node:fs" rm() if in Cloud9', async function () {
            sandbox.stub(extensionUtilities, 'isCloud9').returns(true)
            const rmdirSpy = sandbox.spy(nodefs, 'rm')
            // Folder with subfolders
            const dirPath = mkTestDir('a/b/deleteMe')
            mkdirSync(dirPath, { recursive: true })

            await fsCommon.delete(dirPath, { recursive: true })

            assert(rmdirSpy.calledOnce)
            assert(!existsSync(dirPath))
        })
    })

    describe('stat()', function () {
        it('gets stat of a file', async function () {
            const filePath = await makeFile('test.txt', 'hello world')
            const stat = await fsCommon.stat(filePath)
            assert(stat)
            assert.strictEqual(stat.type, vscode.FileType.File)
        })

        it('throws if no file exists', async function () {
            const filePath = createTestPath('thisDoesNotExist.txt')
            await assert.rejects(() => fsCommon.stat(filePath))
        })
    })

    async function makeFile(relativePath: string, content?: string, options?: { mode?: number }): Promise<string> {
        const filePath = path.join(testRootPath(), relativePath)

        await toFile(content ?? '', filePath)

        if (options?.mode !== undefined) {
            await nodefs.chmod(filePath, options.mode)
        }

        return filePath
    }

    function mkTestDir(relativeDirPath?: string) {
        const dir = createTestPath(relativeDirPath ?? 'testDir')
        mkdirSync(dir, { recursive: true })
        assert(existsSync(dir))
        return dir
    }

    function createTestPath(relativePath: string): string {
        return path.join(testRootPath(), relativePath)
    }

    function testRootPath() {
        return path.join(fakeContext.globalStorageUri.fsPath, 'fsTestDir')
    }

    async function mkTestRoot() {
        return mkdirSync(testRootPath())
    }

    async function deleteTestRoot() {
        rmSync(testRootPath(), { recursive: true, force: true })
    }
})
