/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as AWS from 'aws-sdk'
import * as del from 'del'
import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'

import { loadSharedConfigFiles, SharedConfigFiles } from '../../../shared/credentials/credentialsFile'
import { CredentialsValidationResult, UserCredentialsUtils } from '../../../shared/credentials/userCredentialsUtils'
import { EnvironmentVariables } from '../../../shared/environmentVariables'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { TestLogger } from '../../../shared/loggerUtils'
import { DEFAULT_TEST_ACCOUNT_ID, DEFAULT_TEST_PROFILE_NAME, FakeAwsContext } from '../../utilities/fakeAwsContext'
import { MockStsClient } from '../clients/mockClients'
import { assertThrowsError } from '../utilities/assertUtils'

describe('UserCredentialsUtils', () => {
    let tempFolder: string
    let logger: TestLogger

    const fakeCredentials = new AWS.Credentials('fakeaccess', 'fakesecret')
    const fakeCredentialsWithToken = new AWS.Credentials('fakeaccess', 'fakesecret', 'faketoken')

    before(async () => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        logger = await TestLogger.createTestLogger()
        tempFolder = await makeTemporaryToolkitFolder()
    })

    after(async () => {
        del.sync([tempFolder], { force: true })
        await logger.cleanupLogger()
    })

    describe('getCredentialsFilename', () => {
        it('falls back on default if AWS_SHARED_CREDENTIALS_FILE is not set', async () => {
            const filename = UserCredentialsUtils.getCredentialsFilename()
            assert.strictEqual(filename.length > 0, true)
        })

        it('gets AWS_SHARED_CREDENTIALS_FILE if set', async () => {
            const expectedFilename = path.join(tempFolder, 'credentials-custom-name-test')
            const env = process.env as EnvironmentVariables
            env.AWS_SHARED_CREDENTIALS_FILE = expectedFilename

            const filename = UserCredentialsUtils.getCredentialsFilename()
            assert.strictEqual(filename, expectedFilename)
        })
    })

    describe('getConfigFilename', () => {
        it('falls back on default if AWS_CONFIG_FILE is not set', async () => {
            const filename = UserCredentialsUtils.getConfigFilename()
            assert.strictEqual(filename.length > 0, true)
        })

        it('gets AWS_CONFIG_FILE if set', async () => {
            const expectedFilename = path.join(tempFolder, 'config-custom-name-test')
            const env = process.env as EnvironmentVariables
            env.AWS_CONFIG_FILE = expectedFilename

            const filename = UserCredentialsUtils.getConfigFilename()
            assert.strictEqual(filename, expectedFilename)
        })
    })

    describe('findExistingCredentialsFilenames', () => {
        it('returns both filenames if both files exist', async () => {
            const credentialsFilename = path.join(tempFolder, 'credentials-both-exist-test')
            const configFilename = path.join(tempFolder, 'config-both-exist-test')

            const env = process.env as EnvironmentVariables
            env.AWS_SHARED_CREDENTIALS_FILE = credentialsFilename
            env.AWS_CONFIG_FILE = configFilename

            createCredentialsFile(credentialsFilename, ['default'])
            createCredentialsFile(configFilename, ['default'])

            const foundFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
            assert(foundFiles)
            assert.strictEqual(foundFiles.length, 2)
        })

        it('returns credentials file if it exists and config file does not exist', async () => {
            const credentialsFilename = path.join(tempFolder, 'credentials-exist-test')
            const configFilename = path.join(tempFolder, 'config-not-exist-test')

            const env = process.env as EnvironmentVariables
            env.AWS_SHARED_CREDENTIALS_FILE = credentialsFilename
            env.AWS_CONFIG_FILE = configFilename

            createCredentialsFile(credentialsFilename, ['default'])

            const foundFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
            assert(foundFiles)
            assert.strictEqual(foundFiles.length, 1)
            assert.strictEqual(foundFiles[0], credentialsFilename)
        })

        it('returns config file if it exists and credentials file does not exist', async () => {
            const credentialsFilename = path.join(tempFolder, 'credentials-not-exist-test')
            const configFilename = path.join(tempFolder, 'config-exist-test')

            const env = process.env as EnvironmentVariables
            env.AWS_SHARED_CREDENTIALS_FILE = credentialsFilename
            env.AWS_CONFIG_FILE = configFilename

            createCredentialsFile(configFilename, ['default'])

            const foundFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
            assert(foundFiles)
            assert.strictEqual(foundFiles.length, 1)
            assert.strictEqual(foundFiles[0], configFilename)
        })

        it('returns empty result if neither file exists', async () => {
            const credentialsFilename = path.join(tempFolder, 'credentials-not-exist-test')
            const configFilename = path.join(tempFolder, 'config-not-exist-test')

            const env = process.env as EnvironmentVariables
            env.AWS_SHARED_CREDENTIALS_FILE = credentialsFilename
            env.AWS_CONFIG_FILE = configFilename

            const foundFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
            assert(foundFiles)
            assert.strictEqual(foundFiles.length, 0)
        })
    })

    describe('generateCredentialsFile', () => {
        it('generates a valid credentials file', async () => {
            const credentialsFilename = path.join(tempFolder, 'credentials-generation-test')
            const profileName = 'someRandomProfileName'

            const env = process.env as EnvironmentVariables
            env.AWS_SHARED_CREDENTIALS_FILE = credentialsFilename
            const creds = {
                accessKey: '123',
                profileName: profileName,
                secretKey: 'ABC'
            }
            await UserCredentialsUtils.generateCredentialsFile(
                path.join(__dirname, '..', '..', '..', '..', '..'),
                creds
            )

            const sharedConfigFiles: SharedConfigFiles = await loadSharedConfigFiles()
            assert(typeof sharedConfigFiles === 'object', 'sharedConfigFiles should be an object')
            const profiles = sharedConfigFiles.credentialsFile
            assert(typeof profiles === 'object', 'profiles should be an object')
            assert(profiles[profileName], 'profiles should be truthy')
            assert.strictEqual(
                profiles[profileName].aws_access_key_id,
                creds.accessKey,
                `creds.accessKey: "${profiles[profileName].aws_access_key_id}" !== "${creds.accessKey}"`
            )
            assert.strictEqual(
                profiles[profileName].aws_secret_access_key,
                creds.secretKey,
                `creds.secretKey: "${profiles[profileName].aws_access_key_id}" !== "${creds.secretKey}"`
            )
            const access = promisify(fs.access)
            await access(credentialsFilename, fs.constants.R_OK).catch(err => assert(false, 'Should be readable'))
            await access(credentialsFilename, fs.constants.W_OK).catch(err => assert(false, 'Should be writeable'))
        })
    })

    describe('validateCredentials', () => {
        it('returns a valid result if getCallerIdentity resolves', async () => {
            let timesCalled: number = 0

            const mockResponse: AWS.STS.GetCallerIdentityResponse = {
                Account: 'valid'
            }

            const result: CredentialsValidationResult = await UserCredentialsUtils.validateCredentials(
                fakeCredentials,
                new MockStsClient({
                    getCallerIdentity: async () => {
                        timesCalled++

                        return mockResponse
                    }
                })
            )

            assert.strictEqual(timesCalled, 1)
            assert.strictEqual(result.isValid, true)
            assert.strictEqual(result.account, mockResponse.Account)
        })

        it('returns a valid result if getCallerIdentity resolves while using a session token', async () => {
            let timesCalled: number = 0

            const mockResponse: AWS.STS.GetCallerIdentityResponse = {
                Account: 'valid'
            }

            const result: CredentialsValidationResult = await UserCredentialsUtils.validateCredentials(
                fakeCredentialsWithToken,
                new MockStsClient({
                    getCallerIdentity: async () => {
                        timesCalled++

                        return mockResponse
                    }
                })
            )

            assert.strictEqual(timesCalled, 1)
            assert.strictEqual(result.isValid, true)
            assert.strictEqual(result.account, mockResponse.Account)
        })

        it('returns an invalid result if getCallerIdentity returns undefined', async () => {
            let timesCalled: number = 0

            const mockResponse: AWS.STS.GetCallerIdentityResponse = {
                Account: undefined
            }

            const result: CredentialsValidationResult = await UserCredentialsUtils.validateCredentials(
                fakeCredentials,
                new MockStsClient({
                    getCallerIdentity: async () => {
                        timesCalled++

                        return mockResponse
                    }
                })
            )

            assert.strictEqual(timesCalled, 1)
            assert.strictEqual(result.isValid, false)
        })

        it('returns an invalid result if getCallerIdentity returns undefined while using a session token', async () => {
            let timesCalled: number = 0

            const mockResponse: AWS.STS.GetCallerIdentityResponse = {
                Account: undefined
            }

            const result: CredentialsValidationResult = await UserCredentialsUtils.validateCredentials(
                fakeCredentialsWithToken,
                new MockStsClient({
                    getCallerIdentity: async () => {
                        timesCalled++

                        return mockResponse
                    }
                })
            )

            assert.strictEqual(timesCalled, 1)
            assert.strictEqual(result.isValid, false)
        })

        it('returns an invalid result if getCallerIdentity throws', async () => {
            let timesCalled: number = 0

            const result: CredentialsValidationResult = await UserCredentialsUtils.validateCredentials(
                fakeCredentials,
                new MockStsClient({
                    getCallerIdentity: async () => {
                        timesCalled++

                        throw new Error('Simulating error with explicit throw')
                    }
                })
            )

            assert.strictEqual(timesCalled, 1)
            assert.strictEqual(result.isValid, false)
            assert.strictEqual(result.invalidMessage, 'Simulating error with explicit throw')
        })

        it('returns an invalid result if getCallerIdentity throws with a sessionToken', async () => {
            let timesCalled: number = 0

            const result: CredentialsValidationResult = await UserCredentialsUtils.validateCredentials(
                fakeCredentialsWithToken,
                new MockStsClient({
                    getCallerIdentity: async () => {
                        timesCalled++

                        throw new Error('Simulating error with explicit throw')
                    }
                })
            )

            assert.strictEqual(timesCalled, 1)
            assert.strictEqual(result.isValid, false)
            assert.strictEqual(result.invalidMessage, 'Simulating error with explicit throw')
        })

        it('throws an error if STS is not defined and toolkitClientBuilder cannot create an STS client', async () => {
            await assertThrowsError(async () => await UserCredentialsUtils.validateCredentials(fakeCredentials))
        })
    })

    describe('addUserDataToContext', async () => {
        it('adds profile data to the context if the profile is valid', async () => {
            const testProfile = 'testprofile'
            const testAccount = 'testaccount'
            const mockSts = new MockStsClient({
                getCallerIdentity: async () => {
                    return {
                        UserId: 'testuser',
                        Account: testAccount,
                        Arn: 'testarn'
                    }
                }
            })
            const mockAws = new FakeAwsContext({
                credentials: new AWS.Credentials('access', 'secret')
            })

            assert.strictEqual(mockAws.getCredentialProfileName(), DEFAULT_TEST_PROFILE_NAME)
            assert.strictEqual(mockAws.getCredentialAccountId(), DEFAULT_TEST_ACCOUNT_ID)
            const returnValue = await UserCredentialsUtils.addUserDataToContext(testProfile, mockAws, mockSts)
            assert.strictEqual(returnValue, true)
            assert.strictEqual(mockAws.getCredentialProfileName(), testProfile)
            assert.strictEqual(mockAws.getCredentialAccountId(), testAccount)
        })

        it('adds profile data to the context if the profile is valid with a session token', async () => {
            const testProfile = 'testprofile'
            const testAccount = 'testaccount'
            const mockSts = new MockStsClient({
                getCallerIdentity: async () => {
                    return {
                        UserId: 'testuser',
                        Account: testAccount,
                        Arn: 'testarn'
                    }
                }
            })
            const mockAws = new FakeAwsContext({
                credentials: new AWS.Credentials('access', 'secret', 'token')
            })

            assert.strictEqual(mockAws.getCredentialProfileName(), DEFAULT_TEST_PROFILE_NAME)
            assert.strictEqual(mockAws.getCredentialAccountId(), DEFAULT_TEST_ACCOUNT_ID)
            const returnValue = await UserCredentialsUtils.addUserDataToContext(testProfile, mockAws, mockSts)
            assert.strictEqual(returnValue, true)
            assert.strictEqual(mockAws.getCredentialProfileName(), testProfile)
            assert.strictEqual(mockAws.getCredentialAccountId(), testAccount)
        })

        it('returns false if credentials are invalid', async () => {
            const testProfile = 'testprofile'
            const mockSts = new MockStsClient({
                getCallerIdentity: async () => {
                    throw new AWS.AWSError()
                }
            })
            const mockAws = new FakeAwsContext({
                credentials: new AWS.Credentials('access', 'secret')
            })

            const returnValue = await UserCredentialsUtils.addUserDataToContext(testProfile, mockAws, mockSts)
            assert.strictEqual(returnValue, false)
        })

        it('returns false if credentials are invalid with a session token', async () => {
            const testProfile = 'testprofile'
            const mockSts = new MockStsClient({
                getCallerIdentity: async () => {
                    throw new AWS.AWSError()
                }
            })
            const mockAws = new FakeAwsContext({
                credentials: new AWS.Credentials('access', 'secret', 'token')
            })

            const returnValue = await UserCredentialsUtils.addUserDataToContext(testProfile, mockAws, mockSts)
            assert.strictEqual(returnValue, false)
        })
    })

    describe('removeUserDataFromContext', async () => {
        it('removes user data', async () => {
            const mockAws = new FakeAwsContext()
            assert.strictEqual(mockAws.getCredentialProfileName(), DEFAULT_TEST_PROFILE_NAME)
            assert.strictEqual(mockAws.getCredentialAccountId(), DEFAULT_TEST_ACCOUNT_ID)
            await UserCredentialsUtils.removeUserDataFromContext(mockAws)
            assert.strictEqual(mockAws.getCredentialAccountId(), undefined)
            assert.strictEqual(mockAws.getCredentialProfileName(), undefined)
        })
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
