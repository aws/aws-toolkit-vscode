/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import { getConfigFilename, getCredentialsFilename } from '../../credentials/sharedCredentials'
import { EnvironmentVariables } from '../../shared/environmentVariables'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'

describe('sharedCredentials', () => {
    let tempFolder: string

    before(async () => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async () => {
        const env = process.env as EnvironmentVariables
        delete env.AWS_SHARED_CREDENTIALS_FILE
        delete env.AWS_CONFIG_FILE
    })

    after(async () => {
        del.sync([tempFolder], { force: true })
    })

    describe('getCredentialsFilename', () => {
        it('uses the default credentials path if AWS_SHARED_CREDENTIALS_FILE is not set', async () => {
            const env = process.env as EnvironmentVariables
            env.AWS_SHARED_CREDENTIALS_FILE = ''

            const filename = getCredentialsFilename()
            assert.strictEqual(filename.length > 0, true)
        })

        it('gets AWS_SHARED_CREDENTIALS_FILE if set', async () => {
            const expectedFilename = path.join(tempFolder, 'credentials-custom-name-test')
            const env = process.env as EnvironmentVariables
            env.AWS_SHARED_CREDENTIALS_FILE = expectedFilename

            const filename = getCredentialsFilename()
            assert.strictEqual(filename, expectedFilename)
        })
    })

    describe('getConfigFilename', () => {
        it('uses the default config path if AWS_CONFIG_FILE is not set', async () => {
            const env = process.env as EnvironmentVariables
            env.AWS_CONFIG_FILE = ''

            const filename = getConfigFilename()
            assert.strictEqual(filename.length > 0, true)
        })

        it('gets AWS_CONFIG_FILE if set', async () => {
            const expectedFilename = path.join(tempFolder, 'config-custom-name-test')
            const env = process.env as EnvironmentVariables
            env.AWS_CONFIG_FILE = expectedFilename

            const filename = getConfigFilename()
            assert.strictEqual(filename, expectedFilename)
        })
    })
})
