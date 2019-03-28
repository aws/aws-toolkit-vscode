/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { EnvironmentVariables } from '../../shared/environmentVariables'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { SystemUtilities } from '../../shared/systemUtilities'

describe('SystemUtilities', () => {

    let tempFolder: string

    before(async () => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await makeTemporaryToolkitFolder()
    })

    after(() => {
        del.sync([tempFolder], { force: true })
    })

    describe('getHomeDirectory', () => {
        it('gets HOME if set', async () => {
            const env = process.env as EnvironmentVariables

            env.HOME = 'c:\\qwerty'
            assert.strictEqual(SystemUtilities.getHomeDirectory(), 'c:\\qwerty')
        })

        it('gets USERPROFILE if set and HOME is not set', async () => {
            const env = process.env as EnvironmentVariables

            delete env.HOME
            env.USERPROFILE = 'c:\\profiles\\qwerty'
            assert.strictEqual(SystemUtilities.getHomeDirectory(), 'c:\\profiles\\qwerty')
        })

        it('gets HOMEPATH if set and HOME and USERPROFILE are not set', async () => {
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

        it('prefixes result with HOMEDRIVE if set', async () => {
            const env = process.env as EnvironmentVariables

            delete env.HOME
            delete env.USERPROFILE
            env.HOMEPATH = `${path.sep}users${path.sep}homepath`
            env.HOMEDRIVE = 'x:'
            assert.strictEqual(SystemUtilities.getHomeDirectory(), `x:${path.sep}users${path.sep}homepath`)
        })

        it('falls back on os.homedir if no environment variables are set', async () => {
            const env = process.env as EnvironmentVariables

            delete env.HOME
            delete env.USERPROFILE
            delete env.HOMEPATH
            delete env.HOMEDRIVE

            assert.strictEqual(SystemUtilities.getHomeDirectory(), os.homedir())
        })
    })

    describe('fileExists', () => {
        it('returns true if file exists', async () => {
            const filename: string = path.join(tempFolder, 'existing-file.txt')

            fs.writeFileSync(filename, 'hello world', 'utf8')

            assert.strictEqual(await SystemUtilities.fileExists(filename), true)
        })

        it('returns false if file does not exist', async () => {
            const filename: string = path.join(tempFolder, 'non-existing-file.txt')
            assert.strictEqual(await SystemUtilities.fileExists(filename), false)
        })
    })
})
