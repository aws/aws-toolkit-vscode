/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'

import { EnvironmentVariables } from '../../shared/environmentVariables'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { SystemUtilities } from '../../shared/systemUtilities'
import * as testutil from '../testUtil'

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
        const iswin = (process.platform === 'win32')
        const workspace = vscode.workspace.workspaceFolders![0]
        const tscNodemodules = path.join(workspace.uri.fsPath,
            `foo/bar/node_modules/.bin/tsc${iswin ? '.cmd' : ''}`)
        fs.removeSync(tscNodemodules)

        // The test workspace normally doesn't have node_modules so this will
        // be undefined or it will find the globally-installed "tsc".
        const tscGlobal = await SystemUtilities.findTypescriptCompiler()
        assert.ok(tscGlobal === undefined || tscGlobal === 'tsc')

        // Create a fake "node_modules/.bin/tsc" in the test workspace.
        testutil.createExecutableFile(
            tscNodemodules,
            'echo "typescript Version 42"')

        const result = await SystemUtilities.findTypescriptCompiler()
        assert(result !== undefined)
        testutil.assertEqualPaths(result, tscNodemodules)
        fs.removeSync(tscNodemodules)
    })
})
