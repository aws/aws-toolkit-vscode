/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as os from 'os'
import * as sinon from 'sinon'
import { SmusIamProfileSelector } from '../../../../sagemakerunifiedstudio/auth/ui/iamProfileSelection'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import { fs } from '../../../../shared'
import { EnvironmentVariables } from '../../../../shared/environmentVariables'

describe('SmusIamProfileSelector', function () {
    describe('showRegionSelection', function () {
        it('should be a static method', function () {
            assert.strictEqual(typeof SmusIamProfileSelector.showRegionSelection, 'function')
        })
    })

    describe('showIamProfileSelection', function () {
        it('should be a static method', function () {
            assert.strictEqual(typeof SmusIamProfileSelector.showIamProfileSelection, 'function')
        })
    })

    describe('updateProfileRegion', function () {
        let tempFolder: string
        let credentialsPath: string
        let configPath: string

        beforeEach(async function () {
            tempFolder = await makeTemporaryToolkitFolder()
            credentialsPath = path.join(tempFolder, 'credentials')
            configPath = path.join(tempFolder, 'config')

            // Stub environment variables to use temp files
            sinon.stub(process, 'env').value({
                AWS_SHARED_CREDENTIALS_FILE: credentialsPath,
                AWS_CONFIG_FILE: configPath,
            } as EnvironmentVariables)
        })

        afterEach(async function () {
            await fs.delete(tempFolder, { recursive: true })
            sinon.restore()
        })

        it('should update region in credentials file when profile exists there', async function () {
            // Create credentials file with a profile without region
            const credentialsContent = [
                '[test-profile]',
                'aws_access_key_id = XYZ',
                'aws_secret_access_key = XYZ',
                '',
            ].join(os.EOL)
            await fs.writeFile(credentialsPath, credentialsContent)

            // Call the private method using bracket notation
            await (SmusIamProfileSelector as any).updateProfileRegion('test-profile', 'us-west-2')

            // Verify the region was added
            const updatedContent = await fs.readFileText(credentialsPath)
            assert.ok(updatedContent.includes('region = us-west-2'))
            assert.ok(updatedContent.includes('[test-profile]'))
            assert.ok(updatedContent.includes('aws_access_key_id = XYZ'))
        })

        it('should update region in config file when profile exists there', async function () {
            // Create config file with a profile without region
            const configContent = ['[profile test-profile]', 'output = json', ''].join(os.EOL)
            await fs.writeFile(configPath, configContent)

            // Call the private method
            await (SmusIamProfileSelector as any).updateProfileRegion('test-profile', 'eu-west-1')

            // Verify the region was added
            const updatedContent = await fs.readFileText(configPath)
            assert.ok(updatedContent.includes('region = eu-west-1'))
            assert.ok(updatedContent.includes('[profile test-profile]'))
            assert.ok(updatedContent.includes('output = json'))
        })

        it('should handle multiple profiles in credentials file', async function () {
            // Create credentials file with multiple profiles
            const credentialsContent = [
                '[default]',
                'aws_access_key_id = XYZ',
                'aws_secret_access_key = XYZ',
                '',
                '[test-profile]',
                'aws_access_key_id = XYZ',
                'aws_secret_access_key = XYZ',
                '',
                '[another-profile]',
                'aws_access_key_id = XYZ',
                'aws_secret_access_key = XYZ',
                '',
            ].join(os.EOL)
            await fs.writeFile(credentialsPath, credentialsContent)

            // Update the region for test-profile
            await (SmusIamProfileSelector as any).updateProfileRegion('test-profile', 'us-west-2')

            // Verify the region was added only to test-profile
            const updatedContent = await fs.readFileText(credentialsPath)
            const lines = updatedContent.split(os.EOL)

            // Find test-profile section
            const testProfileIndex = lines.findIndex((line) => line.includes('[test-profile]'))
            const anotherProfileIndex = lines.findIndex((line) => line.includes('[another-profile]'))

            // Check that region is between test-profile and another-profile
            const testProfileSection = lines.slice(testProfileIndex, anotherProfileIndex).join(os.EOL)
            assert.ok(testProfileSection.includes('region = us-west-2'))

            // Check that other profiles are unchanged
            assert.ok(updatedContent.includes('[default]'))
            assert.ok(updatedContent.includes('[another-profile]'))
        })

        it('should throw error when profile does not exist in either file', async function () {
            // Create both files without the target profile
            const credentialsContent = ['[default]', 'aws_access_key_id = XYZ', 'aws_secret_access_key = XYZ'].join(
                os.EOL
            )
            const configContent = ['[profile default]', 'region = us-east-1'].join(os.EOL)
            await fs.writeFile(credentialsPath, credentialsContent)
            await fs.writeFile(configPath, configContent)

            // Attempt to update non-existent profile
            await assert.rejects(
                async () => {
                    await (SmusIamProfileSelector as any).updateProfileRegion('non-existent-profile', 'us-west-2')
                },
                (error: Error) => {
                    assert.ok(error.message.includes('not found'))
                    return true
                }
            )
        })

        it('should throw error when neither file exists', async function () {
            // Attempt to update profile
            await assert.rejects(
                async () => {
                    await (SmusIamProfileSelector as any).updateProfileRegion('test-profile', 'us-west-2')
                },
                (error: Error) => {
                    assert.ok(error.message.includes('not found'))
                    return true
                }
            )
        })
    })
})
