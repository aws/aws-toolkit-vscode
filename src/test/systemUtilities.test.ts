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

import { EnvironmentVariables } from '../shared/environmentVariables'
import { SystemUtilities } from '../shared/systemUtilities'

suite('SystemUtilities Tests', () => {

    let tempFolder: string

    suiteSetup(() => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = fs.mkdtempSync('vsctk')
    })

    suiteTeardown(() => {
        del.sync([tempFolder])
    })

    test('getHomeDirectory - Home', async () => {
        const env = process.env as EnvironmentVariables

        env.HOME = 'c:\\qwerty'
        assert.equal(SystemUtilities.getHomeDirectory(), 'c:\\qwerty')
    })

    test('getHomeDirectory - User Profile', async () => {
        const env = process.env as EnvironmentVariables

        delete env.HOME
        env.USERPROFILE = 'c:\\profiles\\qwerty'
        assert.equal(SystemUtilities.getHomeDirectory(), 'c:\\profiles\\qwerty')
    })

    test('getHomeDirectory - Homepath', async () => {
        const env = process.env as EnvironmentVariables

        delete env.HOME
        delete env.USERPROFILE
        delete env.HOMEDRIVE
        env.HOMEPATH = `${path.sep}users${path.sep}homepath`
        assert.equal(SystemUtilities.getHomeDirectory().toLowerCase(), `c:${path.sep}users${path.sep}homepath`)
    })

    test('getHomeDirectory - Homepath and home drive', async () => {
        const env = process.env as EnvironmentVariables

        delete env.HOME
        delete env.USERPROFILE
        env.HOMEPATH = `${path.sep}users${path.sep}homepath`
        env.HOMEDRIVE = 'x:'
        assert.equal(SystemUtilities.getHomeDirectory(), `x:${path.sep}users${path.sep}homepath`)
    })

    test('getHomeDirectory - os homedir', async () => {
        const env = process.env as EnvironmentVariables

        delete env.HOME
        delete env.USERPROFILE
        delete env.HOMEPATH
        delete env.HOMEDRIVE

        assert.equal(SystemUtilities.getHomeDirectory(), os.homedir())
    })

    test('fileExists with file that exists', async () => {
        const filename: string = path.join(tempFolder, 'existing-file.txt')

        fs.writeFileSync(filename, 'hello world', 'utf8')

        assert.equal(await SystemUtilities.fileExists(filename), true)
    })

    test('fileExists with file that does not exist', async () => {
        const filename: string = path.join(tempFolder, 'non-existing-file.txt')
        assert.equal(await SystemUtilities.fileExists(filename), false)
    })
})
