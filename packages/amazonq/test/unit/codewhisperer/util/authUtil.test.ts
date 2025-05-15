/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as path from 'path'
import { AuthUtil, amazonQScopes } from 'aws-core-vscode/codewhisperer'
import { createTestAuthUtil, TestFolder } from 'aws-core-vscode/test'
import { constants, cache } from 'aws-core-vscode/auth'
import { auth2 } from 'aws-core-vscode/auth'
import { mementoUtils, fs } from 'aws-core-vscode/shared'

describe('AuthUtil', async function () {
    let auth: any

    beforeEach(async function () {
        await createTestAuthUtil()
        auth = AuthUtil.instance
    })

    afterEach(async function () {
        sinon.restore()
    })

    describe('Auth state', function () {
        it('login with BuilderId', async function () {
            await auth.login(constants.builderIdStartUrl, constants.builderIdRegion)
            assert.ok(auth.isConnected())
            assert.ok(auth.isBuilderIdConnection())
        })

        it('login with IDC', async function () {
            await auth.login('https://example.awsapps.com/start', 'us-east-1')
            assert.ok(auth.isConnected())
            assert.ok(auth.isIdcConnection())
        })

        it('identifies internal users', async function () {
            await auth.login(constants.internalStartUrl, 'us-east-1')
            assert.ok(auth.isInternalAmazonUser())
        })

        it('identifies SSO session', function () {
            ;(auth as any).session = { loginType: auth2.LoginTypes.SSO }
            assert.strictEqual(auth.isSsoSession(), true)
        })

        it('identifies non-SSO session', function () {
            ;(auth as any).session = { loginType: auth2.LoginTypes.IAM }
            assert.strictEqual(auth.isSsoSession(), false)
        })
    })

    describe('Token management', function () {
        it('can get token when connected with SSO', async function () {
            await auth.login(constants.builderIdStartUrl, constants.builderIdRegion)
            const token = await auth.getToken()
            assert.ok(token)
        })

        it('throws when getting token without SSO connection', async function () {
            sinon.stub(AuthUtil.instance, 'isSsoSession').returns(false)
            await assert.rejects(async () => await auth.getToken())
        })
    })

    describe('getTelemetryMetadata', function () {
        it('returns valid metadata for BuilderId connection', async function () {
            await auth.login(constants.builderIdStartUrl, constants.builderIdRegion)
            const metadata = await auth.getTelemetryMetadata()
            assert.strictEqual(metadata.credentialSourceId, 'awsId')
            assert.strictEqual(metadata.credentialStartUrl, constants.builderIdStartUrl)
        })

        it('returns valid metadata for IDC connection', async function () {
            await auth.login('https://example.awsapps.com/start', 'us-east-1')
            const metadata = await auth.getTelemetryMetadata()
            assert.strictEqual(metadata.credentialSourceId, 'iamIdentityCenter')
            assert.strictEqual(metadata.credentialStartUrl, 'https://example.awsapps.com/start')
        })

        it('returns undefined metadata when not connected', async function () {
            await auth.logout()
            const metadata = await auth.getTelemetryMetadata()
            assert.strictEqual(metadata.id, 'undefined')
        })
    })

    describe('getAuthFormIds', function () {
        it('returns empty array when not connected', async function () {
            await auth.logout()
            const forms = await auth.getAuthFormIds()
            assert.deepStrictEqual(forms, [])
        })

        it('returns BuilderId forms when using BuilderId', async function () {
            await auth.login(constants.builderIdStartUrl, constants.builderIdRegion)
            const forms = await auth.getAuthFormIds()
            assert.deepStrictEqual(forms, ['builderIdCodeWhisperer'])
        })

        it('returns IDC forms when using IDC without SSO account access', async function () {
            const session = (auth as any).session
            sinon.stub(session, 'getProfile').resolves({
                ssoSession: {
                    settings: {
                        sso_registration_scopes: ['codewhisperer:*'],
                    },
                },
            })

            await auth.login('https://example.awsapps.com/start', 'us-east-1')
            const forms = await auth.getAuthFormIds()
            assert.deepStrictEqual(forms, ['identityCenterCodeWhisperer'])
        })

        it('returns IDC forms with explorer when using IDC with SSO account access', async function () {
            const session = (auth as any).session
            sinon.stub(session, 'getProfile').resolves({
                ssoSession: {
                    settings: {
                        sso_registration_scopes: ['codewhisperer:*', 'sso:account:access'],
                    },
                },
            })

            await auth.login('https://example.awsapps.com/start', 'us-east-1')
            const forms = await auth.getAuthFormIds()
            assert.deepStrictEqual(forms.sort(), ['identityCenterCodeWhisperer', 'identityCenterExplorer'].sort())
        })

        it('returns credentials form for IAM credentials', async function () {
            sinon.stub(auth, 'isSsoSession').returns(false)
            sinon.stub(auth, 'isConnected').returns(true)

            const forms = await auth.getAuthFormIds()
            assert.deepStrictEqual(forms, ['credentials'])
        })
    })

    describe('cacheChangedHandler', function () {
        it('calls logout when event is delete', async function () {
            const logoutSpy = sinon.spy(auth, 'logout')

            await (auth as any).cacheChangedHandler('delete')

            assert.ok(logoutSpy.calledOnce)
        })

        it('calls restore when event is create', async function () {
            const restoreSpy = sinon.spy(auth, 'restore')

            await (auth as any).cacheChangedHandler('create')

            assert.ok(restoreSpy.calledOnce)
        })

        it('does nothing for other events', async function () {
            const logoutSpy = sinon.spy(auth, 'logout')
            const restoreSpy = sinon.spy(auth, 'restore')

            await (auth as any).cacheChangedHandler('unknown')

            assert.ok(logoutSpy.notCalled)
            assert.ok(restoreSpy.notCalled)
        })
    })

    describe('stateChangeHandler', function () {
        let mockLspAuth: any
        let regionProfileManager: any

        beforeEach(function () {
            mockLspAuth = (auth as any).lspAuth
            regionProfileManager = (auth as any).regionProfileManager
        })

        it('updates bearer token when state is refreshed', async function () {
            await auth.login(constants.builderIdStartUrl, 'us-east-1')

            await (auth as any).stateChangeHandler({ state: 'refreshed' })

            assert.ok(mockLspAuth.updateBearerToken.called)
            assert.strictEqual(mockLspAuth.updateBearerToken.firstCall.args[0].data, 'fake-data')
        })

        it('cleans up when connection expires', async function () {
            await auth.login(constants.builderIdStartUrl, 'us-east-1')

            await (auth as any).stateChangeHandler({ state: 'expired' })

            assert.ok(mockLspAuth.deleteBearerToken.called)
        })

        it('deletes bearer token when disconnected', async function () {
            await (auth as any).stateChangeHandler({ state: 'notConnected' })

            assert.ok(mockLspAuth.deleteBearerToken.called)
        })

        it('updates bearer token and restores profile on reconnection', async function () {
            const restoreProfileSelectionSpy = sinon.spy(regionProfileManager, 'restoreProfileSelection')

            await auth.login('https://example.awsapps.com/start', 'us-east-1')

            await (auth as any).stateChangeHandler({ state: 'connected' })

            assert.ok(mockLspAuth.updateBearerToken.called)
            assert.ok(restoreProfileSelectionSpy.called)
        })

        it('clears region profile cache and invalidates profile on IDC connection expiration', async function () {
            const invalidateProfileSpy = sinon.spy(regionProfileManager, 'invalidateProfile')
            const clearCacheSpy = sinon.spy(regionProfileManager, 'clearCache')

            await auth.login('https://example.awsapps.com/start', 'us-east-1')

            await (auth as any).stateChangeHandler({ state: 'expired' })

            assert.ok(invalidateProfileSpy.called)
            assert.ok(clearCacheSpy.called)
        })
    })

    describe('migrateSsoConnectionToLsp', function () {
        let memento: any
        let cacheDir: string
        let fromRegistrationFile: string
        let fromTokenFile: string

        const validProfile = {
            type: 'sso',
            startUrl: 'https://test2.com',
            ssoRegion: 'us-east-1',
            scopes: amazonQScopes,
            metadata: {
                connectionState: 'valid',
            },
        }

        beforeEach(async function () {
            memento = {
                get: sinon.stub(),
                update: sinon.stub().resolves(),
            }
            cacheDir = (await TestFolder.create()).path

            sinon.stub(mementoUtils, 'getEnvironmentSpecificMemento').returns(memento)
            sinon.stub(cache, 'getCacheDir').returns(cacheDir)

            fromTokenFile = cache.getTokenCacheFile(cacheDir, 'profile1')
            const registrationKey = {
                startUrl: validProfile.startUrl,
                region: validProfile.ssoRegion,
                scopes: amazonQScopes,
            }
            fromRegistrationFile = cache.getRegistrationCacheFile(cacheDir, registrationKey)

            const registrationData = { test: 'registration' }
            const tokenData = { test: 'token' }

            await fs.writeFile(fromRegistrationFile, JSON.stringify(registrationData))
            await fs.writeFile(fromTokenFile, JSON.stringify(tokenData))
        })

        afterEach(async function () {
            sinon.restore()
        })

        it('migrates valid SSO connection', async function () {
            memento.get.returns({ profile1: validProfile })

            const updateProfileStub = sinon.stub((auth as any).session, 'updateProfile').resolves()

            await auth.migrateSsoConnectionToLsp('test-client')

            assert.ok(updateProfileStub.calledOnce)
            assert.ok(memento.update.calledWith('auth.profiles', undefined))

            const files = await fs.readdir(cacheDir)
            assert.strictEqual(files.length, 2) // Should have both the token and registration file

            // Verify file contents were preserved
            const newFiles = files.map((f) => path.join(cacheDir, f[0]))
            for (const file of newFiles) {
                const content = await fs.readFileText(file)
                const parsed = JSON.parse(content)
                assert.ok(parsed.test === 'registration' || parsed.test === 'token')
            }
        })

        it('does not migrate if no matching SSO profile exists', async function () {
            const mockProfiles = {
                'test-profile': {
                    type: 'iam',
                    startUrl: 'https://test.com',
                    ssoRegion: 'us-east-1',
                },
            }
            memento.get.returns(mockProfiles)

            await auth.migrateSsoConnectionToLsp('test-client')

            // Assert that the file names have not updated
            const files = await fs.readdir(cacheDir)
            assert.ok(files.length === 2)
            assert.ok(await fs.exists(fromRegistrationFile))
            assert.ok(await fs.exists(fromTokenFile))
            assert.ok(!memento.update.called)
        })

        it('migrates only profile with matching scopes', async function () {
            const mockProfiles = {
                profile1: validProfile,
                profile2: {
                    type: 'sso',
                    startUrl: 'https://test.com',
                    ssoRegion: 'us-east-1',
                    scopes: ['different:scope'],
                    metadata: {
                        connectionState: 'valid',
                    },
                },
            }
            memento.get.returns(mockProfiles)

            const updateProfileStub = sinon.stub((auth as any).session, 'updateProfile').resolves()

            await auth.migrateSsoConnectionToLsp('test-client')

            assert.ok(updateProfileStub.calledOnce)
            assert.ok(memento.update.calledWith('auth.profiles', undefined))
            assert.deepStrictEqual(updateProfileStub.firstCall.args[0], {
                startUrl: validProfile.startUrl,
                region: validProfile.ssoRegion,
                scopes: validProfile.scopes,
            })
        })

        it('uses valid connection state when multiple profiles exist', async function () {
            const mockProfiles = {
                profile2: {
                    ...validProfile,
                    metadata: {
                        connectionState: 'invalid',
                    },
                },
                profile1: validProfile,
            }
            memento.get.returns(mockProfiles)

            const updateProfileStub = sinon.stub((auth as any).session, 'updateProfile').resolves()

            await auth.migrateSsoConnectionToLsp('test-client')

            assert.ok(
                updateProfileStub.calledWith({
                    startUrl: validProfile.startUrl,
                    region: validProfile.ssoRegion,
                    scopes: validProfile.scopes,
                })
            )
        })
    })
})
