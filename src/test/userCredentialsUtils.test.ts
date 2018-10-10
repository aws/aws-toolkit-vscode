/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as AWS from 'aws-sdk'
import * as del from 'del'
import * as fs from 'fs'
import * as path from 'path'

import {
    loadSharedConfigFiles,
    SharedConfigFiles
} from '../shared/credentials/credentialsFile'
import {
    CredentialsValidationResult,
    UserCredentialsUtils,
} from '../shared/credentials/UserCredentialsUtils'
import { EnvironmentVariables } from '../shared/environmentVariables'

suite('UserCredentialsUtils Tests', () => {

    let tempFolder: string

    suiteSetup(() => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = fs.mkdtempSync('vsctk')
    })

    suiteTeardown(() => {
        del.sync([tempFolder])
    })

    test('getCredentialsFilename', async () => {
        const filename = UserCredentialsUtils.getCredentialsFilename()
        assert.equal(filename.length > 0, true)
    })

    test('getCredentialsFilename with filename specified', async () => {
        const expectedFilename = path.join(tempFolder, 'credentials-custom-name-test')
        const env = process.env as EnvironmentVariables
        env.AWS_SHARED_CREDENTIALS_FILE = expectedFilename

        const filename = UserCredentialsUtils.getCredentialsFilename()
        assert.equal(filename, expectedFilename)
    })

    test('getConfigFilename', async () => {
        const filename = UserCredentialsUtils.getConfigFilename()
        assert.equal(filename.length > 0, true)
    })

    test('getConfigFilename with filename specified', async () => {
        const expectedFilename = path.join(tempFolder, 'config-custom-name-test')
        const env = process.env as EnvironmentVariables
        env.AWS_CONFIG_FILE = expectedFilename

        const filename = UserCredentialsUtils.getConfigFilename()
        assert.equal(filename, expectedFilename)
    })

    test('findExistingCredentialsFilenames', async () => {
        const credentialsFilename = path.join(tempFolder, 'credentials-both-exist-test')
        const configFilename = path.join(tempFolder, 'config-both-exist-test')

        const env = process.env as EnvironmentVariables
        env.AWS_SHARED_CREDENTIALS_FILE = credentialsFilename
        env.AWS_CONFIG_FILE = configFilename

        createCredentialsFile(credentialsFilename, ['default'])
        createCredentialsFile(configFilename, ['default'])

        const foundFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
        assert(foundFiles)
        assert.equal(foundFiles.length, 2)
    })

    test('findExistingCredentialsFilenames - credentials only exist', async () => {
        const credentialsFilename = path.join(tempFolder, 'credentials-exist-test')
        const configFilename = path.join(tempFolder, 'config-not-exist-test')

        const env = process.env as EnvironmentVariables
        env.AWS_SHARED_CREDENTIALS_FILE = credentialsFilename
        env.AWS_CONFIG_FILE = configFilename

        createCredentialsFile(credentialsFilename, ['default'])

        const foundFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
        assert(foundFiles)
        assert.equal(foundFiles.length, 1)
        assert.equal(foundFiles[0], credentialsFilename)
    })

    test('findExistingCredentialsFilenames - config only exist', async () => {
        const credentialsFilename = path.join(tempFolder, 'credentials-not-exist-test')
        const configFilename = path.join(tempFolder, 'config-exist-test')

        const env = process.env as EnvironmentVariables
        env.AWS_SHARED_CREDENTIALS_FILE = credentialsFilename
        env.AWS_CONFIG_FILE = configFilename

        createCredentialsFile(configFilename, ['default'])

        const foundFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
        assert(foundFiles)
        assert.equal(foundFiles.length, 1)
        assert.equal(foundFiles[0], configFilename)
    })

    test('findExistingCredentialsFilenames - no files exist', async () => {
        const credentialsFilename = path.join(tempFolder, 'credentials-not-exist-test')
        const configFilename = path.join(tempFolder, 'config-not-exist-test')

        const env = process.env as EnvironmentVariables
        env.AWS_SHARED_CREDENTIALS_FILE = credentialsFilename
        env.AWS_CONFIG_FILE = configFilename

        const foundFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
        assert(foundFiles)
        assert.equal(foundFiles.length, 0)
    })

    test('generateCredentialsFile', async () => {

        const credentialsFilename = path.join(tempFolder, 'credentials-generation-test')
        const profileName = 'someRandomProfileName'

        const env = process.env as EnvironmentVariables
        env.AWS_SHARED_CREDENTIALS_FILE = credentialsFilename

        await UserCredentialsUtils.generateCredentialsFile(
            path.join(__dirname, '..', '..'),
            {
                accessKey: '123',
                profileName: profileName,
                secretKey: 'ABC'
            }
        )

        const profiles: SharedConfigFiles = await loadSharedConfigFiles()
        assert(profiles)
        assert(profiles.credentialsFile)
        assert(profiles.credentialsFile[profileName])
    })

    test('validateCredentials - success', async () => {

        let timesCalled: number = 0

        const mockResponse = {
            promise: async () => {
                return Promise.resolve()
            }
        }

        const mockSts = {
            getCallerIdentity: () => {
                timesCalled++

                return mockResponse
            }
        }

        const result: CredentialsValidationResult = await UserCredentialsUtils.validateCredentials(
            'fakeaccess',
            'fakesecret',
            mockSts as any as AWS.STS)

        assert.equal(timesCalled, 1)
        assert.equal(result.isValid, true)
    })

    test('validateCredentials - failure', async () => {

        let timesCalled: number = 0

        const mockResponse = {
            promise: async () => {
                return Promise.reject('Simulating error')
            }
        }

        const mockSts = {
            getCallerIdentity: () => {
                timesCalled++

                return mockResponse
            }
        }

        const result: CredentialsValidationResult = await UserCredentialsUtils.validateCredentials(
            'fakeaccess',
            'fakesecret',
            mockSts as any as AWS.STS)

        assert.equal(timesCalled, 1)
        assert.equal(result.isValid, false)
        assert.equal(result.invalidMessage, 'Simulating error')
    })

    test('validateCredentials - Error', async () => {

        let timesCalled: number = 0

        const mockResponse = {
            promise: () => {
                throw new Error('An error occurred')
            }
        }

        const mockSts = {
            getCallerIdentity: () => {
                timesCalled++

                return mockResponse
            }
        }

        const result: CredentialsValidationResult = await UserCredentialsUtils.validateCredentials(
            'fakeaccess',
            'fakesecret',
            mockSts as any as AWS.STS)

        assert.equal(timesCalled, 1)
        assert.equal(result.isValid, false)
        assert.equal(result.invalidMessage, 'An error occurred')
    })

    function createCredentialsFile(filename: string, profileNames: string[]): void {
        let fileContents = ''

        profileNames.forEach(profileName => {
            fileContents += `[${profileName}]
aws_access_key_id = FAKEKEY
aws_secret_access_key = FAKESECRET
`
        })

        fs.writeFileSync(filename, fileContents)
    }

})
