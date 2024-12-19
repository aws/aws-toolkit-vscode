/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as sinon from 'sinon'

/* eslint @typescript-eslint/naming-convention: 0 */

import { Uri } from 'vscode'
import {
    getSectionDataOrThrow,
    loadSharedConfigFiles,
    mergeAndValidateSections,
} from '../../../auth/credentials/sharedCredentials'
import { UserCredentialsUtils } from '../../../shared/credentials/userCredentialsUtils'
import { EnvironmentVariables } from '../../../shared/environmentVariables'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { fs } from '../../../shared'

describe('UserCredentialsUtils', function () {
    let tempFolder: string

    beforeEach(async function () {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await fs.delete(tempFolder, { recursive: true })
        sinon.restore()
    })

    describe('findExistingCredentialsFilenames', function () {
        it('returns both filenames if both files exist', async function () {
            const credentialsFilename = path.join(tempFolder, 'credentials-both-exist-test')
            const configFilename = path.join(tempFolder, 'config-both-exist-test')

            sinon.stub(process, 'env').value({
                AWS_SHARED_CREDENTIALS_FILE: credentialsFilename,
                AWS_CONFIG_FILE: configFilename,
            } as EnvironmentVariables)

            await createCredentialsFile(credentialsFilename, ['default'])
            await createCredentialsFile(configFilename, ['default'])

            const foundFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
            assert.strictEqual(foundFiles.length, 2)
        })

        it('returns credentials file if it exists and config file does not exist', async function () {
            const credentialsFilename = path.join(tempFolder, 'credentials-exist-test')
            const configFilename = path.join(tempFolder, 'config-not-exist-test')

            sinon.stub(process, 'env').value({
                AWS_SHARED_CREDENTIALS_FILE: credentialsFilename,
                AWS_CONFIG_FILE: configFilename,
            } as EnvironmentVariables)

            await createCredentialsFile(credentialsFilename, ['default'])

            const foundFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
            assert.strictEqual(foundFiles.length, 1)
            assert.strictEqual(foundFiles[0], Uri.file(credentialsFilename).fsPath)
        })

        it('returns config file if it exists and credentials file does not exist', async function () {
            const credentialsFilename = path.join(tempFolder, 'credentials-not-exist-test')
            const configFilename = path.join(tempFolder, 'config-exist-test')

            sinon.stub(process, 'env').value({
                AWS_SHARED_CREDENTIALS_FILE: credentialsFilename,
                AWS_CONFIG_FILE: configFilename,
            } as EnvironmentVariables)

            await createCredentialsFile(configFilename, ['default'])

            const foundFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
            assert.strictEqual(foundFiles.length, 1)
            assert.strictEqual(foundFiles[0], Uri.file(configFilename).fsPath)
        })

        it('returns empty result if neither file exists', async function () {
            const credentialsFilename = path.join(tempFolder, 'credentials-not-exist-test')
            const configFilename = path.join(tempFolder, 'config-not-exist-test')

            sinon.stub(process, 'env').value({
                AWS_SHARED_CREDENTIALS_FILE: credentialsFilename,
                AWS_CONFIG_FILE: configFilename,
            } as EnvironmentVariables)

            const foundFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
            assert.strictEqual(foundFiles.length, 0)
        })
    })

    describe('generateCredentialsFile', function () {
        it('generates a valid credentials file', async function () {
            const credentialsFilename = path.join(tempFolder, 'credentials-generation-test')
            const profileName = 'someRandomProfileName'

            sinon.stub(process, 'env').value({
                AWS_SHARED_CREDENTIALS_FILE: credentialsFilename,
            } as EnvironmentVariables)
            const creds = {
                accessKey: '123',
                profileName: profileName,
                secretKey: 'ABC',
            }
            await createCredentialsFile(credentialsFilename, [profileName])
            await UserCredentialsUtils.generateCredentialsFile(creds)

            const sharedConfigFiles = await loadSharedConfigFiles({ credentials: Uri.file(credentialsFilename) })
            const profile = getSectionDataOrThrow(
                mergeAndValidateSections(sharedConfigFiles.credentials).sections,
                profileName,
                'profile'
            )
            assert.ok(profile)
            assert.strictEqual(
                profile.aws_access_key_id,
                creds.accessKey,
                `creds.accessKey: "${profile.aws_access_key_id}" !== "${creds.accessKey}"`
            )
            assert.strictEqual(
                profile.aws_secret_access_key,
                creds.secretKey,
                `creds.secretKey: "${profile.aws_access_key_id}" !== "${creds.secretKey}"`
            )

            await assert.doesNotReject(async () => await fs.checkPerms(credentialsFilename, 'r--'))
            await assert.doesNotReject(async () => await fs.checkPerms(credentialsFilename, '-w-'))
        })
    })

    describe('loadSharedConfigFiles', function () {
        it('normalizes fields by making them lowercase', async function () {
            const credentialsFilename = path.join(tempFolder, 'credentials-generation-test')
            const profileName = 'someRandomProfileName'

            await createCredentialsFile(credentialsFilename, [profileName])

            const sharedConfigFiles = await loadSharedConfigFiles({ credentials: Uri.file(credentialsFilename) })
            const profile = getSectionDataOrThrow(
                mergeAndValidateSections(sharedConfigFiles.credentials).sections,
                profileName,
                'profile'
            )
            assert.strictEqual(profile.region, 'us-weast-3')
        })
    })

    async function createCredentialsFile(filename: string, profileNames: string[]): Promise<void> {
        let fileContents = ''

        profileNames.forEach((profileName) => {
            fileContents += `[${profileName}]
aws_access_key_id = FAKEKEY
aws_SecRet_aCCess_key = FAKESECRET
REGION = us-weast-3
`
        })

        await fs.writeFile(filename, fileContents)
    }
})
