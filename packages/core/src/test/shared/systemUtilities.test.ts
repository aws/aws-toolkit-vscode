/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import { fsCommon as fs2 } from '../../srcShared/fs'
import * as os from 'os'
import * as path from 'path'
import * as utils from 'util'

import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { SystemUtilities } from '../../shared/systemUtilities'
import * as testutil from '../testUtil'
import { PermissionsError, formatError, isFileNotFoundError } from '../../shared/errors'

describe('SystemUtilities', function () {
    let testDir: string

    before(async function () {
        testDir = await makeTemporaryToolkitFolder()
    })

    after(async function () {
        await fs2.delete(testDir, { recursive: true, force: true })
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
        // TODO: move these tests to fs.test.ts
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
                    const dirPath = path.join(testDir, `dir${runCounter}`)
                    await fs.mkdir(dirPath)
                    const err = await SystemUtilities.readFile(path.join(dirPath, 'foo')).catch(e => e)
                    assertError(err, Error)
                    assert.ok(isFileNotFoundError(err))
                })
            })

            describe('owned by user', function () {
                it('fails writing a new file to a directory without `u+x`', async function () {
                    const dirPath = path.join(testDir, `dir${runCounter}`)
                    await fs.mkdir(dirPath, { mode: 0o677 })
                    const err = await SystemUtilities.writeFile(path.join(dirPath, 'foo'), 'foo').catch(e => e)
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
                    await fs.mkdir(dirPath, { mode: 0o577 })
                    const err = await SystemUtilities.writeFile(path.join(dirPath, 'foo'), 'foo').catch(e => e)
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
                    await fs.writeFile(filePath, 'foo', { mode: 0o400 })
                    const err = await SystemUtilities.writeFile(filePath, 'foo2').catch(e => e)
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
                    const err = await SystemUtilities.readFile(filePath).catch(e => e)
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
                        await fs.chmod(dirPath, 0o777)
                    })

                    it('fails to delete without `u+w` on the parent', async function () {
                        await fs.chmod(dirPath, 0o577)
                        const err = await SystemUtilities.delete(filePath).catch(e => e)
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
                        await fs.chmod(dirPath, 0o677)
                        const err = await SystemUtilities.delete(filePath).catch(e => e)
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

            // TODO: need to use sticky bit to easily write tests for group-owned directories
            // Or potentially spawn new process with different uid...?
        })
    }
})
