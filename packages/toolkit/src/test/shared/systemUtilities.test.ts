/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import * as utils from 'util'

import { EnvironmentVariables } from '../../shared/environmentVariables'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { SystemUtilities } from '../../shared/systemUtilities'
import * as testutil from '../testUtil'
import { PermissionsError, isFileNotFoundError } from '../../shared/errors'

describe('SystemUtilities', function () {
    let tempFolder: string

    before(async function () {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await makeTemporaryToolkitFolder()
    })

    after(async function () {
        await fs.remove(tempFolder)
    })

    describe('getHomeDirectory', function () {
        it('gets HOME if set', async function () {
            const env = process.env as EnvironmentVariables

            env.HOME = 'c:\\qwerty'
            assert.strictEqual(SystemUtilities.getHomeDirectory(), 'c:\\qwerty')
        })

        it('gets USERPROFILE if set and HOME is not set', async function () {
            const env = process.env as EnvironmentVariables

            delete env.HOME
            env.USERPROFILE = 'c:\\profiles\\qwerty'
            assert.strictEqual(SystemUtilities.getHomeDirectory(), 'c:\\profiles\\qwerty')
        })

        it('gets HOMEPATH if set and HOME and USERPROFILE are not set', async function () {
            const env = process.env as EnvironmentVariables

            delete env.HOME
            delete env.USERPROFILE
            delete env.HOMEDRIVE
            env.HOMEPATH = `${path.sep}users${path.sep}homepath`
            assert.strictEqual(
                SystemUtilities.getHomeDirectory().toLowerCase(),
                `c:${path.sep}users${path.sep}homepath`
            )
        })

        it('prefixes result with HOMEDRIVE if set', async function () {
            const env = process.env as EnvironmentVariables

            delete env.HOME
            delete env.USERPROFILE
            env.HOMEPATH = `${path.sep}users${path.sep}homepath`
            env.HOMEDRIVE = 'x:'
            assert.strictEqual(SystemUtilities.getHomeDirectory(), `x:${path.sep}users${path.sep}homepath`)
        })

        it('falls back on os.homedir if no environment variables are set', async function () {
            const env = process.env as EnvironmentVariables

            delete env.HOME
            delete env.USERPROFILE
            delete env.HOMEPATH
            delete env.HOMEDRIVE

            assert.strictEqual(SystemUtilities.getHomeDirectory(), os.homedir())
        })
    })

    describe('fileExists', function () {
        it('returns true if file exists', async function () {
            const filename: string = path.join(tempFolder, 'existing-file.txt')

            fs.writeFileSync(filename, 'hello world', 'utf8')

            assert.strictEqual(await SystemUtilities.fileExists(filename), true)
        })

        it('returns false if file does not exist', async function () {
            const filename: string = path.join(tempFolder, 'non-existing-file.txt')
            assert.strictEqual(await SystemUtilities.fileExists(filename), false)
        })
    })

    it('findTypescriptCompiler()', async function () {
        const iswin = process.platform === 'win32'
        const workspace = vscode.workspace.workspaceFolders![0]
        const tscNodemodules = path.join(workspace.uri.fsPath, `foo/bar/node_modules/.bin/tsc${iswin ? '.cmd' : ''}`)
        fs.removeSync(tscNodemodules)

        // The test workspace normally doesn't have node_modules so this will
        // be undefined or it will find the globally-installed "tsc".
        const tscGlobal = await SystemUtilities.findTypescriptCompiler()
        assert.ok(tscGlobal === undefined || tscGlobal === 'tsc')

        // Create a fake "node_modules/.bin/tsc" in the test workspace.
        await testutil.createExecutableFile(tscNodemodules, 'echo "typescript Version 42"')

        const result = await SystemUtilities.findTypescriptCompiler()
        assert(result !== undefined)
        testutil.assertEqualPaths(result, tscNodemodules)
        fs.removeSync(tscNodemodules)
    })

    it('getVscodeCliPath()', async function () {
        if (os.platform() === 'linux') {
            this.skip()
        }
        const vscPath = await SystemUtilities.getVscodeCliPath()
        assert(vscPath)
        const regex = /bin[\\\/](code|code-insiders)$/
        assert.ok(regex.test(vscPath), `expected regex ${regex} to match: "${vscPath}"`)
    })

    if (process.platform !== 'win32') {
        describe('permissions', function () {
            let runCounter = 0

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
                    const dirPath = path.join(tempFolder, `dir${runCounter}`)
                    await fs.mkdir(dirPath)
                    const err = await SystemUtilities.readFile(path.join(dirPath, 'foo')).catch(e => e)
                    assertError(err, Error)
                    assert.ok(isFileNotFoundError(err))
                })
            })

            describe('owned by user', function () {
                it('fails writing a new file to a directory without `u+x`', async function () {
                    const dirPath = path.join(tempFolder, `dir${runCounter}`)
                    await fs.mkdir(dirPath, { mode: 0o677 })
                    const err = await SystemUtilities.writeFile(path.join(dirPath, 'foo'), 'foo').catch(e => e)
                    assertError(err, PermissionsError)
                    assert.strictEqual(err.uri.fsPath, vscode.Uri.file(dirPath).fsPath)
                    assert.strictEqual(err.expected, '*wx')
                    assert.strictEqual(err.actual, 'rw-')
                })

                it('fails writing a new file to a directory without `u+w`', async function () {
                    const dirPath = path.join(tempFolder, `dir${runCounter}`)
                    await fs.mkdir(dirPath, { mode: 0o577 })
                    const err = await SystemUtilities.writeFile(path.join(dirPath, 'foo'), 'foo').catch(e => e)
                    assertError(err, PermissionsError)
                    assert.strictEqual(err.uri.fsPath, vscode.Uri.file(dirPath).fsPath)
                    assert.strictEqual(err.expected, '*wx')
                    assert.strictEqual(err.actual, 'r-x')
                })

                it('fails writing an existing file without `u+w`', async function () {
                    const filePath = path.join(tempFolder, `file${runCounter}`)
                    await fs.writeFile(filePath, 'foo', { mode: 0o400 })
                    const err = await SystemUtilities.writeFile(filePath, 'foo2').catch(e => e)
                    assertError(err, PermissionsError)
                    assert.strictEqual(err.uri.fsPath, vscode.Uri.file(filePath).fsPath)
                    assert.strictEqual(err.expected, '*w*')
                    assert.strictEqual(err.actual, 'r--')
                })

                it('fails reading an existing file without `u+r`', async function () {
                    const filePath = path.join(tempFolder, `file${runCounter}`)
                    await fs.writeFile(filePath, 'foo', { mode: 0o200 })
                    const err = await SystemUtilities.readFile(filePath).catch(e => e)
                    assertError(err, PermissionsError)
                    assert.strictEqual(err.uri.fsPath, vscode.Uri.file(filePath).fsPath)
                    assert.strictEqual(err.expected, 'r**')
                    assert.strictEqual(err.actual, '-w-')
                })

                describe('existing files in a directory', function () {
                    let dirPath: string
                    let filePath: string

                    beforeEach(async function () {
                        dirPath = path.join(tempFolder, `dir${runCounter}`)
                        await fs.mkdir(dirPath)
                        filePath = path.join(dirPath, 'file')
                        await fs.writeFile(filePath, 'foo')
                    })

                    afterEach(async function () {
                        await fs.chmod(dirPath, 0o777)
                    })

                    it('fails to delete without `u+w` on the parent', async function () {
                        await fs.chmod(dirPath, 0o577)
                        const err = await SystemUtilities.delete(filePath).catch(e => e)
                        assertError(err, PermissionsError)
                        assert.strictEqual(err.uri.fsPath, vscode.Uri.file(dirPath).fsPath)
                        assert.strictEqual(err.expected, '*wx')
                        assert.strictEqual(err.actual, 'r-x')
                    })

                    it('fails to delete without `u+x` on the parent', async function () {
                        await fs.chmod(dirPath, 0o677)
                        const err = await SystemUtilities.delete(filePath).catch(e => e)
                        assertError(err, PermissionsError)
                        assert.strictEqual(err.uri.fsPath, vscode.Uri.file(dirPath).fsPath)
                        assert.strictEqual(err.expected, '*wx')
                        assert.strictEqual(err.actual, 'rw-')
                    })
                })
            })

            // TODO: need to use sticky bit to easily write tests for group-owned directories
            // Or potentially spawn new process with different uid...?
        })
    }
})
