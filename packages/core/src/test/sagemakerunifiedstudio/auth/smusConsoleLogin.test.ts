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
import {
    checkConflictingCredentialKeys,
    getConflictingProfileNames,
} from '../../../sagemakerunifiedstudio/auth/smusConsoleLogin'

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

    describe('Conflicting credential keys path', function () {
        async function writeConflictingProfile() {
            await fs.writeFile(
                credentialsPath,
                '[profile test-profile]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE\naws_secret_access_key = secret\n'
            )
        }

        it("'differentName': re-prompts, and proceeds to login once a conflict-free name is chosen", async function () {
            await writeConflictingProfile()

            sandbox.stub(SmusIamProfileSelector as any, 'showRegionSelection').resolves('us-west-2')

            const conflictPromptStub = sandbox
                .stub(SmusIamProfileSelector as any, 'showConflictingKeysPrompt')
                .resolves('differentName')
            // Step 1 enters the conflicting name. First re-prompt returns a second conflicting
            // name, second re-prompt returns a clean one.
            const nameInputStub = sandbox.stub(SmusIamProfileSelector as any, 'getProfileNameInput')
            nameInputStub.onCall(0).resolves('test-profile')
            nameInputStub.onCall(1).resolves('test-profile') // still conflicting (re-shown)
            nameInputStub.onCall(2).resolves('clean-profile') // conflict-free

            const loginStub = sandbox.stub(smusConsoleLoginModule, 'tryConsoleLogin').resolves(true)

            const result = await (SmusIamProfileSelector as any).addNewProfileConsole()

            assert.strictEqual(result.profileName, 'clean-profile')
            assert.ok(loginStub.calledOnceWith('clean-profile', 'us-west-2'))
            // Conflict prompt shown once for 'test-profile' (still conflicting after 1st rename)
            // and once more before the clean name resolves it — never for 'clean-profile'.
            assert.ok(conflictPromptStub.callCount >= 1)
        })

        it("'openFile': opens the offending file and throws UserCancelled without logging in", async function () {
            await writeConflictingProfile()

            sandbox.stub(SmusIamProfileSelector as any, 'getProfileNameInput').resolves('test-profile')
            sandbox.stub(SmusIamProfileSelector as any, 'showRegionSelection').resolves('us-west-2')
            sandbox.stub(SmusIamProfileSelector as any, 'showConflictingKeysPrompt').resolves('openFile')
            const openFileStub = sandbox.stub(SmusIamProfileSelector as any, 'openAwsFile').resolves()
            const loginStub = sandbox.stub(smusConsoleLoginModule, 'tryConsoleLogin').resolves(true)

            await assert.rejects(
                async () => (SmusIamProfileSelector as any).addNewProfileConsole(),
                (error: ToolkitError) => {
                    assert.strictEqual(error.code, SmusErrorCodes.UserCancelled)
                    return true
                }
            )

            assert.ok(openFileStub.calledOnceWith('credentials'))
            assert.ok(loginStub.notCalled, 'should not attempt console login after opening the file')
        })

        it("'BACK' on the conflict prompt returns 'BACK' without logging in", async function () {
            await writeConflictingProfile()

            sandbox.stub(SmusIamProfileSelector as any, 'getProfileNameInput').resolves('test-profile')
            sandbox.stub(SmusIamProfileSelector as any, 'showRegionSelection').resolves('us-west-2')
            sandbox.stub(SmusIamProfileSelector as any, 'showConflictingKeysPrompt').resolves('BACK')
            const loginStub = sandbox.stub(smusConsoleLoginModule, 'tryConsoleLogin').resolves(true)

            const result = await (SmusIamProfileSelector as any).addNewProfileConsole()

            assert.strictEqual(result, 'BACK')
            assert.ok(loginStub.notCalled)
        })

        it('a conflict-free profile skips the conflict prompt entirely', async function () {
            // No conflicting keys written - credentials/config files don't exist.
            sandbox.stub(SmusIamProfileSelector as any, 'getProfileNameInput').resolves('clean-profile')
            sandbox.stub(SmusIamProfileSelector as any, 'showRegionSelection').resolves('us-west-2')
            const conflictPromptStub = sandbox.stub(SmusIamProfileSelector as any, 'showConflictingKeysPrompt')
            sandbox.stub(smusConsoleLoginModule, 'tryConsoleLogin').resolves(true)

            const result = await (SmusIamProfileSelector as any).addNewProfileConsole()

            assert.strictEqual(result.profileName, 'clean-profile')
            assert.ok(conflictPromptStub.notCalled)
        })
    })
})

describe('checkConflictingCredentialKeys', function () {
    let sandbox: sinon.SinonSandbox
    let tempFolder: string
    let credentialsPath: string
    let configPath: string

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        tempFolder = await makeTemporaryToolkitFolder()
        credentialsPath = path.join(tempFolder, 'credentials')
        configPath = path.join(tempFolder, 'config')

        sandbox.stub(process, 'env').value({
            AWS_SHARED_CREDENTIALS_FILE: credentialsPath,
            AWS_CONFIG_FILE: configPath,
        } as EnvironmentVariables)
    })

    afterEach(async function () {
        await fs.delete(tempFolder, { recursive: true })
        sandbox.restore()
    })

    it('returns undefined when neither file exists', async function () {
        const result = await checkConflictingCredentialKeys('some-profile')
        assert.strictEqual(result, undefined)
    })

    it('returns undefined when the profile exists but has no conflicting keys', async function () {
        await fs.writeFile(credentialsPath, '[profile clean]\nregion = us-east-1\n')

        const result = await checkConflictingCredentialKeys('clean')
        assert.strictEqual(result, undefined)
    })

    it("returns 'credentials' when the conflict is in the credentials file", async function () {
        await fs.writeFile(credentialsPath, '[profile test]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE\n')

        const result = await checkConflictingCredentialKeys('test')
        assert.strictEqual(result, 'credentials')
    })

    it("returns 'config' when the conflict is in the config file", async function () {
        await fs.writeFile(configPath, '[profile test]\naws_secret_access_key = secret\n')

        const result = await checkConflictingCredentialKeys('test')
        assert.strictEqual(result, 'config')
    })

    it('only reports a conflict for the matching profile name, not other profiles', async function () {
        await fs.writeFile(
            credentialsPath,
            '[profile other]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE\n\n[profile clean]\nregion = us-east-1\n'
        )

        const result = await checkConflictingCredentialKeys('clean')
        assert.strictEqual(result, undefined)
    })
})

describe('getConflictingProfileNames', function () {
    let sandbox: sinon.SinonSandbox
    let tempFolder: string
    let credentialsPath: string
    let configPath: string

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        tempFolder = await makeTemporaryToolkitFolder()
        credentialsPath = path.join(tempFolder, 'credentials')
        configPath = path.join(tempFolder, 'config')

        sandbox.stub(process, 'env').value({
            AWS_SHARED_CREDENTIALS_FILE: credentialsPath,
            AWS_CONFIG_FILE: configPath,
        } as EnvironmentVariables)
    })

    afterEach(async function () {
        await fs.delete(tempFolder, { recursive: true })
        sandbox.restore()
    })

    it('returns an empty set when neither file exists', async function () {
        const result = await getConflictingProfileNames()
        assert.strictEqual(result.size, 0)
    })

    it('includes only profiles with conflicting keys, excluding clean ones', async function () {
        await fs.writeFile(
            credentialsPath,
            [
                '[profile conflicting-one]',
                'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
                '',
                '[profile clean-one]',
                'region = us-east-1',
            ].join('\n')
        )

        const result = await getConflictingProfileNames()

        assert.ok(result.has('conflicting-one'))
        assert.ok(!result.has('clean-one'))
        assert.strictEqual(result.size, 1)
    })

    it('collects conflicting profiles from both credentials and config files', async function () {
        await fs.writeFile(credentialsPath, '[profile from-creds]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE\n')
        await fs.writeFile(configPath, '[profile from-config]\naws_session_token = token\n')

        const result = await getConflictingProfileNames()

        assert.ok(result.has('from-creds'))
        assert.ok(result.has('from-config'))
        assert.strictEqual(result.size, 2)
    })
})
