/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as sinon from 'sinon'
import { SmusIamProfileSelector } from '../../../sagemakerunifiedstudio/auth/ui/iamProfileSelection'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { fs } from '../../../shared'
import { EnvironmentVariables } from '../../../shared/environmentVariables'
import { ToolkitError } from '../../../shared/errors'
import { SmusErrorCodes } from '../../../sagemakerunifiedstudio/shared/smusUtils'

describe('SMUS Console Login', function () {
    let sandbox: sinon.SinonSandbox
    let tempFolder: string
    let credentialsPath: string
    let configPath: string
    let smusConsoleLoginModule: any

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        tempFolder = await makeTemporaryToolkitFolder()
        credentialsPath = path.join(tempFolder, 'credentials')
        configPath = path.join(tempFolder, 'config')

        // Stub environment variables to use temp files
        sandbox.stub(process, 'env').value({
            AWS_SHARED_CREDENTIALS_FILE: credentialsPath,
            AWS_CONFIG_FILE: configPath,
        } as EnvironmentVariables)

        // Get reference to the module for stubbing exports
        smusConsoleLoginModule = require('../../../sagemakerunifiedstudio/auth/smusConsoleLogin')
    })

    afterEach(async function () {
        await fs.delete(tempFolder, { recursive: true })
        sandbox.restore()
    })

    describe('Success path', function () {
        it('returns { profileName, region } matching what was entered', async function () {
            sandbox.stub(SmusIamProfileSelector as any, 'getProfileNameInput').resolves('test-profile')
            sandbox.stub(SmusIamProfileSelector as any, 'showRegionSelection').resolves('us-west-2')
            sandbox.stub(smusConsoleLoginModule, 'tryConsoleLogin').resolves(true)

            const result = await (SmusIamProfileSelector as any).addNewProfileConsole()

            assert.strictEqual(result.profileName, 'test-profile')
            assert.strictEqual(result.region, 'us-west-2')
        })
    })

    describe('Failure path -> user accepts manual fallback', function () {
        it('calls collectProfileData with prefilled { profileName, region }', async function () {
            sandbox.stub(SmusIamProfileSelector as any, 'getProfileNameInput').resolves('test-profile')
            sandbox.stub(SmusIamProfileSelector as any, 'showRegionSelection').resolves('us-west-2')
            sandbox.stub(smusConsoleLoginModule, 'tryConsoleLogin').resolves(false)
            sandbox.stub(SmusIamProfileSelector as any, 'showManualEntryFallbackPrompt').resolves('manual')

            const collectStub = sandbox.stub(SmusIamProfileSelector as any, 'collectProfileData').resolves({
                profileName: 'test-profile',
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                sessionToken: undefined,
                region: 'us-west-2',
            })
            sandbox.stub(SmusIamProfileSelector as any, 'addProfileToCredentialsFile').resolves()

            await (SmusIamProfileSelector as any).addNewProfileConsole()

            // Verify collectProfileData was called with the prefilled object
            assert.ok(collectStub.calledOnce)
            const prefillArg = collectStub.firstCall.args[0]
            assert.strictEqual(prefillArg.profileName, 'test-profile')
            assert.strictEqual(prefillArg.region, 'us-west-2')
        })

        it('returns { profileName, region }', async function () {
            sandbox.stub(SmusIamProfileSelector as any, 'getProfileNameInput').resolves('test-profile')
            sandbox.stub(SmusIamProfileSelector as any, 'showRegionSelection').resolves('us-west-2')
            sandbox.stub(smusConsoleLoginModule, 'tryConsoleLogin').resolves(false)
            sandbox.stub(SmusIamProfileSelector as any, 'showManualEntryFallbackPrompt').resolves('manual')
            sandbox.stub(SmusIamProfileSelector as any, 'collectProfileData').resolves({
                profileName: 'test-profile',
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                sessionToken: undefined,
                region: 'us-west-2',
            })
            sandbox.stub(SmusIamProfileSelector as any, 'addProfileToCredentialsFile').resolves()

            const result = await (SmusIamProfileSelector as any).addNewProfileConsole()

            assert.strictEqual(result.profileName, 'test-profile')
            assert.strictEqual(result.region, 'us-west-2')
        })

        it('credentials are written to disk', async function () {
            sandbox.stub(SmusIamProfileSelector as any, 'getProfileNameInput').resolves('test-profile')
            sandbox.stub(SmusIamProfileSelector as any, 'showRegionSelection').resolves('us-west-2')
            sandbox.stub(smusConsoleLoginModule, 'tryConsoleLogin').resolves(false)
            sandbox.stub(SmusIamProfileSelector as any, 'showManualEntryFallbackPrompt').resolves('manual')
            sandbox.stub(SmusIamProfileSelector as any, 'collectProfileData').resolves({
                profileName: 'test-profile',
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                sessionToken: undefined,
                region: 'us-west-2',
            })
            const writeStub = sandbox.stub(SmusIamProfileSelector as any, 'addProfileToCredentialsFile').resolves()

            await (SmusIamProfileSelector as any).addNewProfileConsole()

            assert.ok(writeStub.calledOnce, 'addProfileToCredentialsFile should be called')
            assert.strictEqual(writeStub.firstCall.args[0], 'test-profile')
            assert.strictEqual(writeStub.firstCall.args[1], 'AKIAIOSFODNN7EXAMPLE')
            assert.strictEqual(writeStub.firstCall.args[2], 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
        })
    })

    describe('Failure path -> user declines manual fallback', function () {
        it('throws UserCancelled error', async function () {
            sandbox.stub(SmusIamProfileSelector as any, 'getProfileNameInput').resolves('test-profile')
            sandbox.stub(SmusIamProfileSelector as any, 'showRegionSelection').resolves('us-west-2')
            sandbox.stub(smusConsoleLoginModule, 'tryConsoleLogin').resolves(false)
            sandbox.stub(SmusIamProfileSelector as any, 'showManualEntryFallbackPrompt').resolves('cancel')

            await assert.rejects(
                async () => (SmusIamProfileSelector as any).addNewProfileConsole(),
                (error: ToolkitError) => {
                    assert.strictEqual(error.code, SmusErrorCodes.UserCancelled)
                    return true
                }
            )
        })

        it('does not write profile to disk', async function () {
            sandbox.stub(SmusIamProfileSelector as any, 'getProfileNameInput').resolves('test-profile')
            sandbox.stub(SmusIamProfileSelector as any, 'showRegionSelection').resolves('us-west-2')
            sandbox.stub(smusConsoleLoginModule, 'tryConsoleLogin').resolves(false)
            sandbox.stub(SmusIamProfileSelector as any, 'showManualEntryFallbackPrompt').resolves('cancel')
            const writeStub = sandbox.stub(SmusIamProfileSelector as any, 'addProfileToCredentialsFile').resolves()

            await (SmusIamProfileSelector as any).addNewProfileConsole().catch(() => {})

            assert.ok(writeStub.notCalled, 'addProfileToCredentialsFile should not be called')
        })
    })
})
