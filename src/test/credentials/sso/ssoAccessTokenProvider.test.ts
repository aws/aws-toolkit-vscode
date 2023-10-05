/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import { SsoAccessTokenProvider } from '../../../auth/sso/ssoAccessTokenProvider'
import { installFakeClock } from '../../testUtil'
import { getCache } from '../../../auth/sso/cache'

import { instance, mock, when, anything, reset, deepEqual } from '../../utilities/mockito'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../../shared/filesystemUtilities'
import { ClientRegistration, SsoToken, proceedToBrowser } from '../../../auth/sso/model'
import { OidcClient } from '../../../auth/sso/clients'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import {
    AuthorizationPendingException,
    InternalServerException,
    InvalidClientException,
    UnauthorizedClientException,
} from '@aws-sdk/client-sso-oidc'
import { getOpenExternalStub } from '../../globalSetup.test'
import { getTestWindow } from '../../shared/vscode/window'
import { SeverityLevel } from '../../shared/vscode/message'
import { ToolkitError } from '../../../shared/errors'
import * as fs from 'fs'
import * as path from 'path'

const hourInMs = 3600000

describe('SsoAccessTokenProvider', function () {
    const region = 'fakeRegion'
    const startUrl = 'fakeUrl'
    const oidcClient = mock(OidcClient)

    let sut: SsoAccessTokenProvider
    let cache: ReturnType<typeof getCache>
    let clock: FakeTimers.InstalledClock
    let tempDir: string

    function createToken(timeDelta: number, extras: Partial<SsoToken> = {}) {
        return {
            accessToken: 'dummyAccessToken',
            expiresAt: new clock.Date(clock.Date.now() + timeDelta),
            ...extras,
        }
    }

    function createRegistration(timeDelta: number, extras: Partial<ClientRegistration> = {}) {
        return {
            scopes: [],
            clientId: 'dummyClientId',
            clientSecret: 'dummyClientSecret',
            expiresAt: new clock.Date(clock.Date.now() + timeDelta),
            ...extras,
        }
    }

    function createAuthorization(timeDelta: number) {
        return {
            interval: 1,
            deviceCode: 'dummyCode',
            userCode: 'dummyUserCode',
            verificationUri: 'dummyLink',
            expiresAt: new clock.Date(clock.Date.now() + timeDelta),
        }
    }

    async function makeTemporaryTokenCacheFolder() {
        const root = await makeTemporaryToolkitFolder()
        const cacheDir = path.join(root, '.aws', 'sso', 'cache')
        fs.mkdirSync(cacheDir, { recursive: true })
        return cacheDir
    }

    before(function () {
        clock = installFakeClock()
    })

    after(function () {
        clock.uninstall()
    })

    beforeEach(async function () {
        tempDir = await makeTemporaryTokenCacheFolder()
        cache = getCache(tempDir)
        sut = new SsoAccessTokenProvider({ region, startUrl }, cache, instance(oidcClient))
    })

    afterEach(async function () {
        sinon.restore()
        clock.reset()
        reset(oidcClient)
        await tryRemoveFolder(tempDir)
    })

    describe('invalidate', function () {
        it('removes cached tokens and registrations', async function () {
            const validToken = createToken(hourInMs)
            await cache.token.save(startUrl, { region, startUrl, token: validToken })
            await cache.registration.save({ region }, createRegistration(hourInMs))
            await sut.invalidate()

            assert.strictEqual(await cache.token.load(startUrl), undefined)
            assert.strictEqual(await cache.registration.load({ region }), undefined)
        })
    })

    describe('getToken', function () {
        it('returns a cached token', async function () {
            const validToken = createToken(hourInMs)
            await cache.token.save(startUrl, { region, startUrl, token: validToken })

            assert.deepStrictEqual(await sut.getToken(), validToken)
        })

        it('invalidates expired tokens', async function () {
            const expiredToken = createToken(-hourInMs)
            await cache.token.save(startUrl, { region, startUrl, token: expiredToken })
            await sut.getToken()

            assert.strictEqual(await cache.token.load(startUrl), undefined)
        })

        it('returns `undefined` for expired tokens that cannot be refreshed', async function () {
            const expiredToken = createToken(-hourInMs)
            await cache.token.save(startUrl, { region, startUrl, token: expiredToken })

            assert.strictEqual(await sut.getToken(), undefined)
        })

        it('refreshes expired tokens', async function () {
            const refreshedToken = createToken(hourInMs, { accessToken: 'newToken' })
            when(oidcClient.createToken(anything())).thenResolve(refreshedToken)

            const refreshableToken = createToken(-hourInMs, { refreshToken: 'refreshToken' })
            const validRegistation = createRegistration(hourInMs)
            const access = { region, startUrl, token: refreshableToken, registration: validRegistation }
            await cache.token.save(startUrl, access)
            assert.deepStrictEqual(await sut.getToken(), refreshedToken)

            const cachedToken = await cache.token.load(startUrl).then(a => a?.token)
            assert.deepStrictEqual(cachedToken, refreshedToken)
        })

        it('does not refresh if missing a client registration', async function () {
            const refreshableToken = createToken(-hourInMs, { refreshToken: 'refreshToken' })
            await cache.token.save(startUrl, { region, startUrl, token: refreshableToken })

            assert.strictEqual(await sut.getToken(), undefined)

            const cachedToken = await cache.token.load(startUrl).then(a => a?.token)
            assert.strictEqual(cachedToken, undefined)
        })

        describe('Exceptions', function () {
            it('drops expired tokens if failure was a client-fault', async function () {
                const exception = new UnauthorizedClientException({ message: '', $metadata: {} })
                when(oidcClient.createToken(anything())).thenReject(exception)

                const refreshableToken = createToken(-hourInMs, { refreshToken: 'refreshToken' })
                const validRegistation = createRegistration(hourInMs)
                const access = { region, startUrl, token: refreshableToken, registration: validRegistation }
                await cache.token.save(startUrl, access)
                await assert.rejects(sut.getToken())

                const cachedToken = await cache.token.load(startUrl)
                assert.strictEqual(cachedToken, undefined)
            })

            it('preserves expired tokens if failure was not a client-fault', async function () {
                const exception = new InternalServerException({ message: '', $metadata: {} })
                when(oidcClient.createToken(anything())).thenReject(exception)

                const refreshableToken = createToken(-hourInMs, { refreshToken: 'refreshToken' })
                const validRegistation = createRegistration(hourInMs)
                const access = { region, startUrl, token: refreshableToken, registration: validRegistation }
                await cache.token.save(startUrl, access)
                await assert.rejects(sut.getToken())

                const cachedToken = await cache.token.load(startUrl).then(a => a?.token)
                assert.deepStrictEqual(cachedToken, refreshableToken)
            })
        })
    })

    describe('createToken', function () {
        beforeEach(function () {
            getTestWindow().onDidShowMessage(m => {
                if (m.items[0]?.title.match(proceedToBrowser)) {
                    m.items[0].select()
                }
            })
        })

        function stubOpen(userClicked = true) {
            getOpenExternalStub().resolves(userClicked)
        }

        function setupFlow(opts?: { skipAuthorization: boolean }) {
            const token = createToken(hourInMs)
            const registration = createRegistration(hourInMs)
            const authorization = createAuthorization(hourInMs)

            when(oidcClient.registerClient(anything())).thenResolve(registration)
            if (!opts?.skipAuthorization) {
                when(oidcClient.startDeviceAuthorization(anything())).thenResolve(authorization)
            }
            when(oidcClient.createToken(anything())).thenResolve(token)

            return { token, registration, authorization }
        }

        it('runs the full SSO flow', async function () {
            const { token, registration } = setupFlow()
            stubOpen()

            assert.deepStrictEqual(await sut.createToken(), { ...token, identity: startUrl })
            const cachedToken = await cache.token.load(startUrl).then(a => a?.token)
            assert.deepStrictEqual(cachedToken, token)
            assert.deepStrictEqual(await cache.registration.load({ region }), registration)
        })

        it('always creates a new token, even if already cached', async function () {
            const { token } = setupFlow()
            stubOpen()

            const cachedToken = createToken(hourInMs, { accessToken: 'someOtherToken' })
            await cache.token.save(startUrl, { region, startUrl, token: cachedToken })

            assert.deepStrictEqual(await sut.getToken(), cachedToken)
            assert.deepStrictEqual(await sut.createToken(), { ...token, identity: startUrl })
            assert.deepStrictEqual(await sut.getToken(), token)
            assert.notDeepStrictEqual(await sut.getToken(), cachedToken)
        })

        it('respects the device authorization expiration time', async function () {
            setupFlow()
            stubOpen()
            const exception = new AuthorizationPendingException({ message: '', $metadata: {} })
            const authorization = createAuthorization(1000)
            when(oidcClient.createToken(anything())).thenReject(exception)
            when(oidcClient.startDeviceAuthorization(anything())).thenResolve(authorization)

            const resp = sut.createToken()
            const progress = await getTestWindow().waitForMessage(/login page opened/i)
            await clock.tickAsync(750)
            assert.ok(progress.visible)
            await clock.tickAsync(750)
            assert.ok(!progress.visible)
            await assert.rejects(resp, ToolkitError)
        })

        /**
         * Saves an expired client registration to the cache.
         */
        async function saveExpiredRegistrationToCache(): Promise<{
            key: { region: string; scopes: string[] }
            registration: ClientRegistration
        }> {
            const key = { region, scopes: [] }
            const registration = {
                clientId: 'myExpiredClientId',
                clientSecret: 'myExpiredClientSecret',
                expiresAt: new clock.Date(clock.Date.now() - 1), // expired date
            }
            await cache.registration.save(key, registration)
            return { key, registration }
        }

        it('registers a new client registration if the existing client registration is expired', async function () {
            const { token, registration: validRegistration, authorization } = setupFlow({ skipAuthorization: true })
            stubOpen()

            const { key: registrationKey, registration: expiredRegistration } = await saveExpiredRegistrationToCache()
            // If we do not invalidate the expired registration, startDeviceAuthorization()
            // will be given expired registration values. The following ensures we only
            // return a value when startDeviceAuthorization() is given valid registration values.
            when(
                oidcClient.startDeviceAuthorization(
                    deepEqual({
                        startUrl: startUrl,
                        clientId: validRegistration.clientId,
                        clientSecret: validRegistration.clientSecret,
                    })
                )
            ).thenResolve(authorization)

            // sanity check we have expired registration in cache
            assert.deepStrictEqual(await cache.registration.load(registrationKey), expiredRegistration)
            const result = await sut.createToken()
            // a valid registration should be cached since the previous was expired
            assert.deepStrictEqual(await cache.registration.load(registrationKey), validRegistration)
            assert.deepStrictEqual(result, { ...token, identity: startUrl }) // verify final result
        })

        describe('Exceptions', function () {
            it('removes the client registration cache on client faults', async function () {
                const exception = new UnauthorizedClientException({ message: '', $metadata: {} })
                const registration = createRegistration(hourInMs)

                when(oidcClient.registerClient(anything())).thenResolve(registration)
                when(oidcClient.startDeviceAuthorization(anything())).thenReject(exception)

                await assert.rejects(sut.createToken(), exception)
                assert.strictEqual(await cache.registration.load({ region }), undefined)
            })

            it('removes the client registration cache on client faults (token step)', async function () {
                const exception = new InvalidClientException({ message: '', $metadata: {} })
                const registration = createRegistration(hourInMs)

                when(oidcClient.registerClient(anything())).thenResolve(registration)
                when(oidcClient.startDeviceAuthorization(anything())).thenResolve(createAuthorization(hourInMs))
                when(oidcClient.createToken(anything())).thenReject(exception)

                stubOpen()

                await assert.rejects(sut.createToken(), exception)
                assert.strictEqual(await cache.registration.load({ region }), undefined)
            })

            it('preserves the client registration cache on server faults', async function () {
                const exception = new InternalServerException({ message: '', $metadata: {} })
                const registration = createRegistration(hourInMs)

                when(oidcClient.registerClient(anything())).thenResolve(registration)
                when(oidcClient.startDeviceAuthorization(anything())).thenReject(exception)

                await assert.rejects(sut.createToken(), exception)
                assert.deepStrictEqual(await cache.registration.load({ region }), registration)
            })
        })

        describe('Cancellation', function () {
            beforeEach(function () {
                setupFlow()
                const exception = new AuthorizationPendingException({ message: '', $metadata: {} })
                when(oidcClient.createToken(anything())).thenReject(exception)
            })

            it('stops the flow if user does not click the link', async function () {
                stubOpen(false)
                await assert.rejects(sut.createToken(), ToolkitError)
            })

            it('saves the client registration even when cancelled', async function () {
                stubOpen(false)
                const registration = createRegistration(hourInMs)
                await cache.registration.save({ region }, registration)
                await assert.rejects(sut.createToken(), ToolkitError)
                const cached = await cache.registration.load({ region })
                assert.deepStrictEqual(cached, registration)
            })

            it('stops the flow if cancelled from the progress notification', async function () {
                stubOpen()
                getTestWindow().onDidShowMessage(m => {
                    if (m.severity === SeverityLevel.Progress) {
                        m.selectItem('Cancel')
                    }
                })
                await assert.rejects(sut.createToken(), CancellationError)
                assert.strictEqual(getTestWindow().shownMessages.length, 2)
            })
        })
    })
})
