/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as os from 'os'
import * as path from 'path'
import * as testutil from '../../testUtil'
import { fs } from '../../../shared'
import { findSshPath, findTypescriptCompiler, getVscodeCliPath, tryRun } from '../../../shared/utilities/pathFind'
import { isCI, isWin } from '../../../shared/vscode/env'

describe('pathFind', function () {
    it('findTypescriptCompiler()', async function () {
        const workspace = vscode.workspace.workspaceFolders![0]
        const tscNodemodules = path.join(workspace.uri.fsPath, `foo/bar/node_modules/.bin/tsc${isWin() ? '.cmd' : ''}`)
        await fs.delete(tscNodemodules, { force: true })

        // The test workspace normally doesn't have node_modules so this will
        // be undefined or it will find the globally-installed "tsc".
        const tscGlobal = await findTypescriptCompiler()
        assert.ok(tscGlobal === undefined || tscGlobal === 'tsc')

        // Create a fake "node_modules/.bin/tsc" in the test workspace.
        await testutil.createExecutableFile(tscNodemodules, 'echo "typescript Version 42"')

        const result = await findTypescriptCompiler()
        assert(result !== undefined)
        testutil.assertEqualPaths(result, tscNodemodules)
        await fs.delete(tscNodemodules)
    })

    it('getVscodeCliPath()', async function () {
        if (os.platform() === 'linux') {
            this.skip()
        }
        const vscPath = await getVscodeCliPath()
        assert(vscPath)
        const regex = /bin[\\\/](code|code-insiders)$/
        assert.ok(regex.test(vscPath), `expected regex ${regex} to match: "${vscPath}"`)
    })

    describe('findSshPath', function () {
        let previousPath: string | undefined

        beforeEach(function () {
            previousPath = process.env.PATH
        })

        afterEach(function () {
            process.env.PATH = previousPath
        })

        it('first tries ssh in $PATH (Non-Windows)', async function () {
            // skip on windows because ssh in path will never work with .exe extension.
            if (isWin()) {
                return
            }
            const workspace = await testutil.createTestWorkspaceFolder()
            const fakeSshPath = path.join(workspace.uri.fsPath, `ssh`)

            process.env.PATH = workspace.uri.fsPath

            await testutil.createExecutableFile(fakeSshPath, '')

            const secondResult = await findSshPath(false)

            assert.strictEqual(secondResult, 'ssh')
        })

        it('only returns valid executable ssh path (Non-Windows)', async function () {
            if (isWin()) {
                return
            }
            // On non-windows, we can overwrite path and create our own executable to find.
            const workspace = await testutil.createTestWorkspaceFolder()
            const fakeSshPath = path.join(workspace.uri.fsPath, `ssh`)

            process.env.PATH = workspace.uri.fsPath

            await testutil.createExecutableFile(fakeSshPath, '')

            const ssh = await findSshPath(false)
            assert.ok(ssh)
            const result = await tryRun(ssh, [], 'yes')
            assert.ok(result)
        })

        it('caches result from previous runs (Non-Windows)', async function () {
            if (isWin()) {
                return
            }
            // On non-windows, we can overwrite path and create our own executable to find.
            const workspace = await testutil.createTestWorkspaceFolder()
            // We move the ssh to a temp directory temporarily to test if cache works.
            const fakeSshPath = path.join(workspace.uri.fsPath, `ssh`)

            process.env.PATH = workspace.uri.fsPath

            await testutil.createExecutableFile(fakeSshPath, '')

            const ssh1 = (await findSshPath(true))!

            await fs.delete(fakeSshPath)

            const ssh2 = await findSshPath(true)

            assert.strictEqual(ssh1, ssh2)
        })

        it('finds valid executable path (Windows CI)', async function () {
            // Don't want to be messing with System32 on peoples local machines.
            if (!isWin() || !isCI()) {
                return
            }
            const expectedPathInCI = 'C:/Windows/System32/OpenSSH/ssh.exe'

            if (!(await fs.exists(expectedPathInCI))) {
                await testutil.createExecutableFile(expectedPathInCI, '')
            }
            const ssh = (await findSshPath(true))!
            const result = await tryRun(ssh, ['-G', 'x'], 'noresult')
            assert.ok(result)
        })
    })
})
