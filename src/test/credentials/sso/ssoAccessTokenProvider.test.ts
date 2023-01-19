/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import { SsoAccessTokenProvider } from '../../../credentials/sso/ssoAccessTokenProvider'
import { installFakeClock } from '../../testUtil'
import { getCache } from '../../../credentials/sso/cache'
import * as vscode from 'vscode'

import { instance, mock, when, anything, reset } from '../../utilities/mockito'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../../shared/filesystemUtilities'
import { ClientRegistration, SsoToken } from '../../../credentials/sso/model'
import { OidcClient } from '../../../credentials/sso/clients'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { InternalServerException, InvalidClientException, UnauthorizedClientException } from '@aws-sdk/client-sso-oidc'

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
            verificationUriComplete: 'dummyLink',
            expiresAt: new clock.Date(clock.Date.now() + timeDelta),
        }
    }

    before(function () {
        clock = installFakeClock()
    })

    after(function () {
        clock.uninstall()
    })

    beforeEach(async function () {
        tempDir = await makeTemporaryToolkitFolder()
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
        function stubOpen(userClicked = true) {
            sinon.stub(vscode.env, 'openExternal').callsFake(async () => userClicked)
        }

        function setupFlow() {
            const token = createToken(hourInMs)
            const registration = createRegistration(hourInMs)
            const authorization = createAuthorization(hourInMs)

            when(oidcClient.registerClient(anything())).thenResolve(registration)
            when(oidcClient.startDeviceAuthorization(anything())).thenResolve(authorization)
            when(oidcClient.pollForToken(anything(), anything(), anything())).thenResolve(token)

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
                when(oidcClient.pollForToken(anything(), anything(), anything())).thenReject(exception)

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
                stubOpen(false)
                setupFlow()
            })

            it('stops the flow if user does not click the link', async function () {
                await assert.rejects(sut.createToken(), CancellationError)
            })

            it('saves the client registration even when cancelled', async function () {
                const registration = createRegistration(hourInMs)
                await cache.registration.save({ region }, registration)
                await assert.rejects(sut.createToken(), CancellationError)
                const cached = await cache.registration.load({ region })
                assert.deepStrictEqual(cached, registration)
            })
        })
    })
})
