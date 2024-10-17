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
import { findSshPath, findTypescriptCompiler, getVscodeCliPath } from '../../../shared/utilities/pathFind'
import { isWin } from '../../../shared/vscode/env'

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
        let previousEnv: NodeJS.ProcessEnv

        beforeEach(function () {
            previousEnv = testutil.readEnv()
        })

        afterEach(function () {
            testutil.setEnv(previousEnv)
        })

        it('first tries ssh in $PATH', async function () {
            const workspace = await testutil.createTestWorkspaceFolder()
            const fakeSshPath = path.join(workspace.uri.fsPath, `ssh${isWin() ? '.cmd' : ''}`)

            testutil.setEnv(testutil.envWithNewPath(workspace.uri.fsPath))
            const firstResult = await findSshPath(false)

            await testutil.createExecutableFile(fakeSshPath, 'echo "this is ssh"')

            const secondResult = await findSshPath(false)

            assert.notStrictEqual(firstResult, secondResult)
            assert.strictEqual(secondResult, 'ssh')
        })

        it('only returns executable ssh path', async function () {
            const workspace = await testutil.createTestWorkspaceFolder()
            const fakeSshPath = path.join(workspace.uri.fsPath, `ssh${isWin() ? '.cmd' : ''}`)
            await fs.writeFile(fakeSshPath, 'this is not executable')

            testutil.setEnv(testutil.envWithNewPath(workspace.uri.fsPath))
            const firstResult = await findSshPath(false)
            assert.notStrictEqual(firstResult, 'ssh')
        })

        it('caches result from previous runs', async function () {
            const workspace = await testutil.createTestWorkspaceFolder()
            const fakeSshPath = path.join(workspace.uri.fsPath, `ssh${isWin() ? '.cmd' : ''}`)
            await testutil.createExecutableFile(fakeSshPath, 'echo "this is ssh"')

            testutil.setEnv(testutil.envWithNewPath(workspace.uri.fsPath))
            const firstResult = await findSshPath(true)

            await fs.delete(fakeSshPath)

            const secondResult = await findSshPath(true)

            assert.strictEqual(firstResult, secondResult)
            assert.strictEqual(secondResult, 'ssh')
        })
    })
})
