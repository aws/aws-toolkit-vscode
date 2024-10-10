/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import * as path from 'path'
import * as utils from 'util'
import { existsSync, mkdirSync, promises as nodefs, readFileSync } from 'fs' // eslint-disable-line no-restricted-imports
import { stat } from 'fs/promises'
import nodeFs from 'fs' // eslint-disable-line no-restricted-imports
import fs, { FileSystem } from '../../../shared/fs/fs'
import * as os from 'os'
import { isMinVscode, isWin } from '../../../shared/vscode/env'
import Sinon from 'sinon'
import * as extensionUtilities from '../../../shared/extensionUtilities'
import { PermissionsError, formatError, isFileNotFoundError, scrubNames } from '../../../shared/errors'
import { EnvironmentVariables } from '../../../shared/environmentVariables'
import * as testutil from '../../testUtil'
import globals from '../../../shared/extensionGlobals'
import { driveLetterRegex } from '../../../shared/utilities/pathUtils'
import { IdeFileSystem } from '../../../shared/telemetry/telemetry.gen'
import { TestFolder } from '../../testUtil'

describe('FileSystem', function () {
    let sandbox: Sinon.SinonSandbox
    let testFolder: TestFolder

    before(async function () {
        sandbox = Sinon.createSandbox()
    })

    beforeEach(async function () {
        testFolder = await TestFolder.create()
    })

    afterEach(async function () {
        sandbox.restore()
    })

    describe('readFileAsString()', function () {
        it('reads a file', async function () {
            const path = await testFolder.write('test.txt', 'hello world')
            const pathAsUri = vscode.Uri.file(path)

            assert.strictEqual(await fs.readFileText(path), 'hello world')
            assert.strictEqual(await fs.readFileText(pathAsUri), 'hello world')
        })

        it('throws when no permissions', async function () {
            if (isWin()) {
                console.log('Skipping since windows does not support mode permissions')
                return this.skip()
            }

            const fileName = 'test.txt'
            const path = await testFolder.write(fileName, 'hello world', { mode: 0o000 })

            await assert.rejects(fs.readFileText(path), (err) => {
                assert(err instanceof PermissionsError)
                assert.strictEqual(err.code, 'InvalidPermissions')
                assert(err.message.includes(fileName))
                return true
            })
        })
    })

    describe('writeFile()', function () {
        const opts: { atomic: boolean }[] = [{ atomic: false }, { atomic: true }]

        opts.forEach((opt) => {
            it(`writes a file (atomic: ${opt.atomic})`, async function () {
                const filePath = testFolder.pathFrom('myFileName')
                await fs.writeFile(filePath, 'MyContent', opt)
                assert.strictEqual(readFileSync(filePath, 'utf-8'), 'MyContent')
            })
        })

        it('writes a file with encoded text', async function () {
            const filePath = testFolder.pathFrom('myFileName')
            const text = 'hello'
            const content = new TextEncoder().encode(text)

            await fs.writeFile(filePath, content)

            assert.strictEqual(readFileSync(filePath, 'utf-8'), text)
        })

        it('makes dirs if missing', async function () {
            const filePath = testFolder.pathFrom('dirA/dirB/myFileName.txt')
            await fs.writeFile(filePath, 'MyContent')
            assert.strictEqual(readFileSync(filePath, 'utf-8'), 'MyContent')
        })

        // We try multiple methods to do an atomic write, but if one fails we want to fallback
        // to the next method. The following are the different combinations of this when a method throws.
        const throwCombinations = [
            { vsc: false, node: false },
            { vsc: true, node: false },
            { vsc: true, node: true },
        ]
        throwCombinations.forEach((throws) => {
            it(`still writes a file if one of the atomic write methods fails: ${JSON.stringify(throws)}`, async function () {
                if (throws.vsc) {
                    sandbox.stub(fs, 'rename').throws(new Error('Test Error Message VSC'))
                }
                if (throws.node) {
                    sandbox.stub(nodeFs.promises, 'rename').throws(new Error('Test Error Message Node'))
                }
                const filePath = testFolder.pathFrom('myFileName')

                await fs.writeFile(filePath, 'MyContent', { atomic: true })

                assert.strictEqual(readFileSync(filePath, 'utf-8'), 'MyContent')
                const expectedTelemetry: IdeFileSystem[] = []
                if (throws.vsc) {
                    expectedTelemetry.push({
                        action: 'writeFile',
                        result: 'Failed',
                        reason: 'writeFileAtomicVscRename',
                        reasonDesc: 'Test Error Message VSC',
                    })
                }
                if (throws.node) {
                    expectedTelemetry.push({
                        action: 'writeFile',
                        result: 'Failed',
                        reason: 'writeFileAtomicNodeRename',
                        reasonDesc: 'Test Error Message Node',
                    })
                }
                if (expectedTelemetry.length > 0) {
                    testutil.assertTelemetry('ide_fileSystem', expectedTelemetry)
                }
            })
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
            const filePath = await testFolder.write(fileName, 'hello world', { mode: 0o000 })

            await assert.rejects(fs.writeFile(filePath, 'MyContent'), (err) => {
                assert(err instanceof PermissionsError)
                assert.strictEqual(err.code, 'InvalidPermissions')
                assert(err.message.includes(fileName))
                return true
            })
        })
    })

    describe('appendFile()', function () {
        it('appends to a file', async function () {
            const filePath = await testFolder.write('test.txt', 'LINE-1-TEXT')
            await fs.appendFile(filePath, '\nLINE-2-TEXT')
            assert.strictEqual(readFileSync(filePath, 'utf-8'), 'LINE-1-TEXT\nLINE-2-TEXT')
        })

        it('creates new file if it does not exist', async function () {
            const filePath = testFolder.pathFrom('thisDoesNotExist.txt')
            await fs.appendFile(filePath, 'i am nikolas')
            assert.strictEqual(readFileSync(filePath, 'utf-8'), 'i am nikolas')
        })
    })

    describe('existsFile()', function () {
        it('true for existing file', async function () {
            const file = await testFolder.write('test.txt')
            assert.strictEqual(await fs.existsFile(file), true)
        })

        it('false for non-existent file', async function () {
            const nonExistantFile = testFolder.pathFrom('thisDoesNotExist.txt')
            assert.strictEqual(await fs.existsFile(nonExistantFile), false)
        })

        it('false for existing directory', async function () {
            const dir = await testFolder.mkdir('thisIsDirectory')
            assert.strictEqual(await fs.existsFile(dir), false)
        })
    })

    describe('existsDir()', function () {
        it('true for existing directory', async function () {
            const dir = await testFolder.mkdir('myDir')
            assert.strictEqual(await fs.existsDir(dir), true)
        })

        it('false for non-existent directory', async function () {
            const noFile = testFolder.pathFrom('non-existent')
            assert.strictEqual(await fs.existsDir(noFile), false)
        })
    })

    describe('exists()', function () {
        it('true for existing file/directory', async function () {
            const dir = await testFolder.mkdir('myDir')
            const file = await testFolder.write('test.txt')
            assert.strictEqual(await fs.exists(dir), true)
            assert.strictEqual(await fs.exists(file), true)
        })

        it('false for non-existent file/directory', async function () {
            const noFile = testFolder.pathFrom('non-existent')
            assert.strictEqual(await fs.exists(noFile), false)
        })
    })

    describe('mkdir()', function () {
        const paths = ['a', 'a/b', 'a/b/c', 'a/b/c/d/']

        paths.forEach(async function (p) {
            it(`creates folder: '${p}'`, async function () {
                const dirPath = testFolder.pathFrom(p)
                await fs.mkdir(dirPath)
                assert(existsSync(dirPath))
            })
        })

        paths.forEach(async function (p) {
            it(`creates folder but uses the "fs" module if in Cloud9: '${p}'`, async function () {
                sandbox.stub(extensionUtilities, 'isCloud9').returns(true)
                const dirPath = testFolder.pathFrom(p)
                const mkdirSpy = sandbox.spy(nodefs, 'mkdir')

                await fs.mkdir(dirPath)

                assert(existsSync(dirPath))
                assert.deepStrictEqual(mkdirSpy.args[0], [dirPath, { recursive: true }])
            })
        })

        it('does NOT throw if dir already exists', async function () {
            // We do not always want this behavior, but it seems that this is how the vsc implementation
            // does it. Look at the Node FS implementation instead as that throws if the dir already exists.
            const dirPath = testFolder.pathFrom('a')
            await fs.mkdir(dirPath)
            await fs.mkdir(dirPath)
        })
    })

    describe('readdir()', function () {
        it('lists files in a directory', async function () {
            await testFolder.write('a.txt')
            await testFolder.write('b.txt')
            await testFolder.write('c.txt')
            mkdirSync(testFolder.pathFrom('dirA'))
            mkdirSync(testFolder.pathFrom('dirB'))
            mkdirSync(testFolder.pathFrom('dirC'))

            const files = await fs.readdir(testFolder.path)
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
            const files = await fs.readdir(testFolder.path)
            assert.deepStrictEqual(files, [])
        })

        function sorted(i: [string, vscode.FileType][]) {
            return i.sort((a, b) => a[0].localeCompare(b[0]))
        }

        it('uses the "fs" readdir implementation if in Cloud9', async function () {
            sandbox.stub(extensionUtilities, 'isCloud9').returns(true)
            const readdirSpy = sandbox.spy(nodefs, 'readdir')

            await testFolder.write('a.txt')
            await testFolder.write('b.txt')
            await testFolder.write('c.txt')
            mkdirSync(testFolder.pathFrom('dirA'))
            mkdirSync(testFolder.pathFrom('dirB'))
            mkdirSync(testFolder.pathFrom('dirC'))

            const files = await fs.readdir(testFolder.path)
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
            const targetDir = await testFolder.mkdir('targetDir')
            await testFolder.write('targetDir/a.txt', 'I am A')
            await testFolder.write('targetDir/dirB/b.txt', 'I am B')

            const destDir = path.join(testFolder.path, 'destDir')
            await fs.copy(targetDir, destDir)

            assert.strictEqual(await fs.readFileText(path.join(destDir, 'a.txt')), 'I am A')
            assert.strictEqual(await fs.readFileText(path.join(destDir, 'dirB/b.txt')), 'I am B')
        })
    })

    describe('delete()', function () {
        it('deletes file', async function () {
            const f = await testFolder.write('test.txt', 'hello world')
            assert(existsSync(f))
            await fs.delete(f)
            assert(!existsSync(f))
        })

        it('fails to delete non-empty directory with recursive:false (the default)', async function () {
            const dir = await testFolder.mkdir()
            const f = path.join(dir, 'testfile.txt')
            await testutil.toFile('some content', f)
            assert(existsSync(dir))
            await assert.rejects(() => fs.delete(dir), /not empty|non-empty/)
            assert(existsSync(dir))
        })

        it('deletes directory with recursive:true', async function () {
            const dir = await testFolder.mkdir()
            await testFolder.write('testfile.txt', 'testText')
            await fs.delete(dir, { recursive: true })
            assert(!existsSync(dir))
        })

        it('no error if file not found (but parent exists)', async function () {
            const dir = await testFolder.mkdir()
            const f = path.join(dir, 'missingfile.txt')
            assert(!existsSync(f))
            await fs.delete(f)
        })

        it('error if file *and* its parent dir not found', async function () {
            const dir = await testFolder.mkdir()
            const f = path.join(dir, 'missingdir/missingfile.txt')
            assert(!existsSync(f))
            await assert.rejects(() => fs.delete(f))
        })

        it('uses "node:fs" rm() if in Cloud9', async function () {
            sandbox.stub(extensionUtilities, 'isCloud9').returns(true)
            const rmdirSpy = sandbox.spy(nodefs, 'rm')
            // Folder with subfolders
            const dirPath = await testFolder.mkdir('a/b/deleteMe')
            mkdirSync(dirPath, { recursive: true })

            await fs.delete(dirPath, { recursive: true })

            assert(rmdirSpy.calledOnce)
            assert(!existsSync(dirPath))
        })
    })

    describe('stat()', function () {
        it('gets stat of a file', async function () {
            const filePath = await testFolder.write('test.txt', 'hello world')
            const stat = await fs.stat(filePath)
            assert(stat)
            assert.strictEqual(stat.type, vscode.FileType.File)
        })

        it('throws if no file exists', async function () {
            const filePath = testFolder.pathFrom('thisDoesNotExist.txt')
            await assert.rejects(() => fs.stat(filePath))
        })
    })

    describe('chmod()', async function () {
        it('changes permissions when not on web, otherwise does not throw', async function () {
            const filePath = await testFolder.write('test.txt', 'hello world', { mode: 0o777 })
            await fs.chmod(filePath, 0o644)
            // chmod doesn't exist on windows, non-unix permission system.
            if (!globals.isWeb && os.platform() !== 'win32') {
                const result = await stat(filePath)
                assert.strictEqual(result.mode & 0o777, 0o644)
            }
        })

        it('throws if no file exists', async function () {
            const filePath = testFolder.pathFrom('thisDoesNotExist.txt')
            await assert.rejects(() => fs.chmod(filePath, 0o644))
        })
    })

    describe('rename()', async () => {
        it('renames a file', async () => {
            const oldPath = await testFolder.write('oldFile.txt', 'hello world')
            const newPath = path.join(path.dirname(oldPath), 'newFile.txt')

            await fs.rename(oldPath, newPath)

            assert.strictEqual(await fs.readFileText(newPath), 'hello world')
            assert(!existsSync(oldPath))
            assert.deepStrictEqual(testutil.getMetrics('ide_fileSystem').length, 0)
        })

        it('renames a folder', async () => {
            const oldPath = await testFolder.mkdir('test')
            await fs.writeFile(path.join(oldPath, 'file.txt'), 'test text')
            const newPath = path.join(path.dirname(oldPath), 'newName')

            await fs.rename(oldPath, newPath)

            assert(existsSync(newPath))
            assert.deepStrictEqual(await fs.readFileText(path.join(newPath, 'file.txt')), 'test text')
            assert(!existsSync(oldPath))
        })

        it('overwrites if destination exists', async () => {
            const oldPath = await testFolder.write('oldFile.txt', 'hello world')
            const newPath = await testFolder.write('newFile.txt', 'some content')

            await fs.rename(oldPath, newPath)

            assert.strictEqual(await fs.readFileText(newPath), 'hello world')
            assert(!existsSync(oldPath))
        })

        it('throws if source does not exist', async () => {
            const clock = testutil.installFakeClock()
            try {
                const oldPath = testFolder.pathFrom('oldFile.txt')
                const newPath = testFolder.pathFrom('newFile.txt')

                const result = fs.rename(oldPath, newPath)
                await clock.tickAsync(FileSystem.renameTimeoutOpts.timeout)
                await assert.rejects(result)

                testutil.assertTelemetry('ide_fileSystem', {
                    action: 'rename',
                    result: 'Failed',
                    reason: 'SourceNotExists',
                    reasonDesc: `After ${FileSystem.renameTimeoutOpts.timeout}ms the source path did not exist: ${scrubNames(oldPath)}`,
                })
            } finally {
                clock.uninstall()
            }
        })

        it('source file does not exist at first, but eventually appears', async () => {
            const oldPath = testFolder.pathFrom('oldFile.txt')
            const newPath = testFolder.pathFrom('newFile.txt')

            const result = fs.rename(oldPath, newPath)
            // this file is created after the first "exists" check fails, the following check should pass
            void testutil.toFile('hello world', oldPath)
            await result

            testutil.assertTelemetry('ide_fileSystem', {
                action: 'rename',
                result: 'Succeeded',
                reason: 'RenameRaceCondition',
            })
        })
    })

    describe('getUserHomeDir()', function () {
        let fakeHome: string
        let saveEnv: EnvironmentVariables = {}

        function restoreEnv() {
            for (const name of ['HOME', 'HOMEDRIVE', 'HOMEPATH', 'USERPROFILE']) {
                if (saveEnv[name] === undefined) {
                    delete process.env[name]
                } else {
                    const v = saveEnv[name]
                    assert(typeof v === 'string')
                    process.env[name] = v
                }
            }
        }

        before(async function () {
            const ws = await testutil.createTestWorkspaceFolder(undefined, 'test-home-dir')
            fakeHome = ws.uri.fsPath
            saveEnv = { ...process.env } as EnvironmentVariables
        })

        after(async function () {
            await fs.delete(fakeHome, { recursive: true, force: true })
            restoreEnv()
            await fs.init(globals.context, () => undefined)
        })

        beforeEach(async function () {
            restoreEnv()
            await fs.init(globals.context, () => undefined)
        })

        it('getUsername() never fails', async function () {
            const env = process.env as EnvironmentVariables
            env.HOME = fakeHome
            let homeDirLogs = await fs.init(globals.context, () => undefined)
            assert.deepStrictEqual(homeDirLogs, [])

            assert(fs.getUsername().length > 0)

            // getUsername() falls back to $USER.
            homeDirLogs = await fs.init(
                globals.context,
                () => undefined,
                () => {
                    throw new Error()
                }
            )
            assert.deepStrictEqual(homeDirLogs, [])
            env.USER = 'test-user-env-var'
            assert.deepStrictEqual(fs.getUsername(), 'test-user-env-var')

            // getUsername() falls back to home dir name.
            delete env.USER
            homeDirLogs = await fs.init(
                globals.context,
                () => undefined,
                () => {
                    throw new Error()
                }
            )
            assert.deepStrictEqual(homeDirLogs, [])
            assert.deepStrictEqual(fs.getUsername(), 'test-home-dir')
        })

        it('gets $HOME', async function () {
            const env = process.env as EnvironmentVariables
            env.HOME = fakeHome
            const homeDirLogs = await fs.init(globals.context, () => undefined)
            assert.strictEqual(fs.getUserHomeDir(), fakeHome)
            assert.deepStrictEqual(homeDirLogs, [])
        })

        it('gets $USERPROFILE if $HOME is not defined', async function () {
            const env = process.env as EnvironmentVariables
            delete env.HOME
            env.HOMEDRIVE = 'bogus1-nonexistent-HOMEDRIVE'
            env.HOMEPATH = 'bogus1-nonexistent-HOMEPATH'
            env.USERPROFILE = fakeHome
            const homeDirLogs = await fs.init(globals.context, () => undefined)
            testutil.assertEqualPaths(fs.getUserHomeDir(), fakeHome)
            assert.deepStrictEqual(homeDirLogs, [])
        })

        it('gets $HOMEDRIVE/$HOMEPATH if $HOME and $USERPROFILE are not valid', async function () {
            const env = process.env as EnvironmentVariables
            env.HOME = 'bogus2-nonexistent-HOME'
            env.USERPROFILE = 'bogus2-nonexistent-USERPROFILE'
            env.HOMEDRIVE = env.HOMEDRIVE?.trim() ? env.HOMEDRIVE : '/'
            env.HOMEPATH = fakeHome.replace(driveLetterRegex, '')

            assert(env.HOMEDRIVE)
            const homeDirLogs = await fs.init(globals.context, () => undefined)
            testutil.assertEqualPaths(fs.getUserHomeDir(), path.join(env.HOMEDRIVE, env.HOMEPATH))
            assert.deepStrictEqual(homeDirLogs, [
                '$HOME filepath is invalid: "bogus2-nonexistent-HOME"',
                '$USERPROFILE filepath is invalid: "bogus2-nonexistent-USERPROFILE"',
            ])
        })

        it('gets os.homedir() if no environment variables are valid', async function () {
            const env = process.env as EnvironmentVariables

            delete env.HOME
            delete env.USERPROFILE
            delete env.HOMEPATH
            delete env.HOMEDRIVE

            const homeDirLogs = await fs.init(globals.context, () => undefined)
            testutil.assertEqualPaths(fs.getUserHomeDir(), os.homedir())
            assert.deepStrictEqual(homeDirLogs, [])

            env.HOME = 'bogus3-nonexistent-HOME'
            env.HOMEDRIVE = 'bogus3-nonexistent-HOMEDRIVE'
            env.HOMEPATH = 'bogus3-nonexistent-HOMEPATH'
            env.USERPROFILE = 'bogus3-nonexistent-USERPROFILE'

            let isHomeDirValid: boolean | undefined
            const homeDirLogs2 = await fs.init(globals.context, () => {
                isHomeDirValid = false
            })
            testutil.assertEqualPaths(fs.getUserHomeDir(), os.homedir())
            assert.strictEqual(isHomeDirValid, false)
            assert.deepStrictEqual(homeDirLogs2, [
                '$HOME filepath is invalid: "bogus3-nonexistent-HOME"',
                '$USERPROFILE filepath is invalid: "bogus3-nonexistent-USERPROFILE"',
                '$HOMEPATH filepath is invalid: "bogus3-nonexistent-HOMEDRIVE/bogus3-nonexistent-HOMEPATH"'.replace(
                    /\//g,
                    path.sep
                ),
            ])
        })
    })

    if (!isWin()) {
        // TODO: need to use sticky bit to easily write tests for group-owned directories
        // Or potentially spawn new process with different uid...?
        describe('permissions', function () {
            let runCounter = 0
            let testDir: string

            before(async function () {
                const ws = await testutil.createTestWorkspaceFolder()
                testDir = ws.uri.fsPath
            })

            after(async function () {
                await fs.delete(testDir, { recursive: true, force: true })
            })

            beforeEach(function () {
                runCounter++
            })

            function assertError<T>(err: unknown, ctor: new (...args: any[]) => T): asserts err is T {
                if (!(err instanceof ctor)) {
                    throw new assert.AssertionError({
                        message: `Error was not an instance of ${ctor.name}: ${utils.inspect(err)}`,
                    })
                }
            }

            describe('unrelated exceptions', function () {
                it('bubbles up ENOENT', async function () {
                    const dirPath = path.join(testDir, `dir${runCounter}`)
                    await fs.mkdir(dirPath)
                    const err = await fs.readFileText(path.join(dirPath, 'foo')).catch((e) => e)
                    assertError(err, Error)
                    assert.ok(isFileNotFoundError(err))
                })
            })

            describe('owned by user', function () {
                it('fails writing a new file to a directory without `u+x`', async function () {
                    const dirPath = path.join(testDir, `dir${runCounter}`)
                    await nodefs.mkdir(dirPath, { mode: 0o677 })
                    const err = await fs.writeFile(path.join(dirPath, 'foo'), 'foo').catch((e) => e)
                    assert.match(
                        formatError(err),
                        /incorrect permissions. Expected rwx, found rw-. \[InvalidPermissions\] \(isOwner: true; mode: drw-r.xr-x [^ ]* \d+\)/
                    )
                    assert.strictEqual(err.uri.fsPath, vscode.Uri.file(dirPath).fsPath)
                    assert.strictEqual(err.expected, '*wx')
                    assert.strictEqual(err.actual, 'rw-')
                })

                it('fails writing a new file to a directory without `u+w`', async function () {
                    const dirPath = path.join(testDir, `dir${runCounter}`)
                    await nodefs.mkdir(dirPath, { mode: 0o577 })
                    const err = await fs.writeFile(path.join(dirPath, 'foo'), 'foo').catch((e) => e)
                    assert.match(
                        formatError(err),
                        /incorrect permissions. Expected rwx, found r-x. \[InvalidPermissions\] \(isOwner: true; mode: dr-xr.xr-x [^ ]* \d+\)/
                    )
                    assertError(err, PermissionsError)
                    assert.strictEqual(err.uri.fsPath, vscode.Uri.file(dirPath).fsPath)
                    assert.strictEqual(err.expected, '*wx')
                    assert.strictEqual(err.actual, 'r-x')
                })

                it('fails writing an existing file without `u+w`', async function () {
                    const filePath = path.join(testDir, `file${runCounter}`)
                    await nodefs.writeFile(filePath, 'foo', { mode: 0o400 })
                    const err = await fs.writeFile(filePath, 'foo2').catch((e) => e)
                    assert.match(
                        formatError(err),
                        /incorrect permissions. Expected rw-, found r--. \[InvalidPermissions\] \(isOwner: true; mode: -r-------- [^ ]* \d+\)/
                    )
                    assertError(err, PermissionsError)
                    assert.strictEqual(err.uri.fsPath, vscode.Uri.file(filePath).fsPath)
                    assert.strictEqual(err.expected, '*w*')
                    assert.strictEqual(err.actual, 'r--')
                })

                it('fails reading an existing file without `u+r`', async function () {
                    const filePath = path.join(testDir, `file${runCounter}`)
                    await fs.writeFile(filePath, 'foo', { mode: 0o200 })
                    const err = await fs.readFileBytes(filePath).catch((e) => e)
                    assert.match(
                        formatError(err),
                        /incorrect permissions. Expected rw-, found -w-. \[InvalidPermissions\] \(isOwner: true; mode: --w------- [^ ]* \d+\)/
                    )
                    assertError(err, PermissionsError)
                    assert.strictEqual(err.uri.fsPath, vscode.Uri.file(filePath).fsPath)
                    assert.strictEqual(err.expected, 'r**')
                    assert.strictEqual(err.actual, '-w-')
                })

                describe('existing files in a directory', function () {
                    let dirPath: string
                    let filePath: string

                    beforeEach(async function () {
                        dirPath = path.join(testDir, `dir${runCounter}`)
                        await fs.mkdir(dirPath)
                        filePath = path.join(dirPath, 'file')
                        await fs.writeFile(filePath, 'foo')
                    })

                    afterEach(async function () {
                        await nodefs.chmod(dirPath, 0o777)
                    })

                    it('fails to delete without `u+w` on the parent', async function () {
                        await nodefs.chmod(dirPath, 0o577)
                        const err = await fs.delete(filePath).catch((e) => e)
                        assert.match(
                            formatError(err),
                            /incorrect permissions. Expected rwx, found r-x. \[InvalidPermissions\] \(isOwner: true; mode: dr-xrwxrwx [^ ]* \d+\)/
                        )
                        assertError(err, PermissionsError)
                        assert.strictEqual(err.uri.fsPath, vscode.Uri.file(dirPath).fsPath)
                        assert.strictEqual(err.expected, '*wx')
                        assert.strictEqual(err.actual, 'r-x')
                    })

                    it('fails to delete without `u+x` on the parent', async function () {
                        await nodefs.chmod(dirPath, 0o677)
                        const err = await fs.delete(filePath).catch((e) => e)
                        assert.match(
                            formatError(err),
                            /incorrect permissions. Expected rwx, found rw-. \[InvalidPermissions\] \(isOwner: true; mode: drw-rwxrwx [^ ]* \d+\)/
                        )
                        assertError(err, PermissionsError)
                        assert.strictEqual(err.uri.fsPath, vscode.Uri.file(dirPath).fsPath)
                        assert.strictEqual(err.expected, '*wx')
                        assert.strictEqual(err.actual, 'rw-')
                    })
                })
            })
        })
    }
})
