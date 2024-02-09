/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as fs from 'fs-extra'
import { EnvironmentVariables } from '../../shared/environmentVariables'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { getCredentialsFilename, getConfigFilename } from '../../auth/credentials/sharedCredentialsFile'

describe('sharedCredentials', function () {
    let tempFolder: string

    before(async function () {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        const env = process.env as EnvironmentVariables
        delete env.AWS_SHARED_CREDENTIALS_FILE
        delete env.AWS_CONFIG_FILE
    })

    after(async function () {
        await fs.remove(tempFolder)
    })

    describe('getCredentialsFilename', function () {
        it('uses the default credentials path if AWS_SHARED_CREDENTIALS_FILE is not set', async function () {
            const env = process.env as EnvironmentVariables
            env.AWS_SHARED_CREDENTIALS_FILE = ''

            const filename = getCredentialsFilename()
            assert.strictEqual(filename.length > 0, true)
        })

        it('gets AWS_SHARED_CREDENTIALS_FILE if set', async function () {
            const expectedFilename = path.join(tempFolder, 'credentials-custom-name-test')
            const env = process.env as EnvironmentVariables
            env.AWS_SHARED_CREDENTIALS_FILE = expectedFilename

            const filename = getCredentialsFilename()
            assert.strictEqual(filename, expectedFilename)
        })
    })

    describe('getConfigFilename', function () {
        it('uses the default config path if AWS_CONFIG_FILE is not set', async function () {
            const env = process.env as EnvironmentVariables
            env.AWS_CONFIG_FILE = ''

            const filename = getConfigFilename()
            assert.strictEqual(filename.length > 0, true)
        })

        it('gets AWS_CONFIG_FILE if set', async function () {
            const expectedFilename = path.join(tempFolder, 'config-custom-name-test')
            const env = process.env as EnvironmentVariables
            env.AWS_CONFIG_FILE = expectedFilename

            const filename = getConfigFilename()
            assert.strictEqual(filename, expectedFilename)
        })
    })
})
