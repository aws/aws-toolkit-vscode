/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import { SsoAccessTokenProvider } from '../../../credentials/sso/ssoAccessTokenProvider'
import { installFakeClock } from '../../testUtil'
import * as cache from '../../../credentials/sso/cache'
import * as vscode from 'vscode'

import { instance, mock, when, anything, reset } from '../../utilities/mockito'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../../shared/filesystemUtilities'
import { ClientRegistration, SsoToken } from '../../../credentials/sso/model'
import { OidcClient } from '../../../credentials/sso/clients'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { InternalServerException, InvalidClientException, UnauthorizedClientException } from '@aws-sdk/client-sso-oidc'

const HOUR_IN_MS = 3600000

describe('SsoAccessTokenProvider', function () {
    const region = 'fakeRegion'
    const startUrl = 'fakeUrl'
    const oidcClient = mock(OidcClient)

    let sut: SsoAccessTokenProvider
    let clock: FakeTimers.InstalledClock
    let tempDir: string

    function setupCaches(dir: string) {
        const tempCache = cache.getCache(dir)
        sinon.stub(cache, 'getCache').callsFake(() => tempCache)
        return tempCache
    }

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
        sut = new SsoAccessTokenProvider({ region, startUrl }, setupCaches(tempDir), instance(oidcClient))
    })

    afterEach(async function () {
        sinon.restore()
        clock.reset()
        reset(oidcClient)
        await tryRemoveFolder(tempDir)
    })

    describe('getToken', function () {
        it('returns a cached token', async function () {
            const validToken = createToken(HOUR_IN_MS)
            await cache.getTokenCache().save(startUrl, { region, startUrl, token: validToken })

            assert.deepStrictEqual(await sut.getToken(), validToken)
        })

        it('invalidates expired tokens', async function () {
            const expiredToken = createToken(-HOUR_IN_MS)
            await cache.getTokenCache().save(startUrl, { region, startUrl, token: expiredToken })
            await sut.getToken()

            assert.strictEqual(await cache.getTokenCache().load(startUrl), undefined)
        })

        it('returns `undefined` for expired tokens that cannot be refreshed', async function () {
            const expiredToken = createToken(-HOUR_IN_MS)
            await cache.getTokenCache().save(startUrl, { region, startUrl, token: expiredToken })

            assert.strictEqual(await sut.getToken(), undefined)
        })

        it('refreshes expired tokens', async function () {
            const refreshedToken = createToken(HOUR_IN_MS, { accessToken: 'newToken' })
            when(oidcClient.createToken(anything())).thenResolve(refreshedToken)

            const refreshableToken = createToken(-HOUR_IN_MS, { refreshToken: 'refreshToken' })
            const validRegistation = createRegistration(HOUR_IN_MS)
            const access = { region, startUrl, token: refreshableToken, registration: validRegistation }
            await cache.getTokenCache().save(startUrl, access)
            assert.deepStrictEqual(await sut.getToken(), refreshedToken)

            const cachedToken = await cache
                .getTokenCache()
                .load(startUrl)
                .then(a => a?.token)
            assert.deepStrictEqual(cachedToken, refreshedToken)
        })

        it('does not refresh if missing a client registration', async function () {
            const refreshableToken = createToken(-HOUR_IN_MS, { refreshToken: 'refreshToken' })
            await cache.getTokenCache().save(startUrl, { region, startUrl, token: refreshableToken })

            assert.strictEqual(await sut.getToken(), undefined)

            const cachedToken = await cache
                .getTokenCache()
                .load(startUrl)
                .then(a => a?.token)
            assert.strictEqual(cachedToken, undefined)
        })
    })

    describe('createToken', function () {
        function stubOpen(userClicked = true) {
            sinon.stub(vscode.env, 'openExternal').callsFake(async () => userClicked)
        }

        function setupFlow() {
            const token = createToken(HOUR_IN_MS)
            const registration = createRegistration(HOUR_IN_MS)
            const authorization = createAuthorization(HOUR_IN_MS)

            when(oidcClient.registerClient(anything())).thenResolve(registration)
            when(oidcClient.startDeviceAuthorization(anything())).thenResolve(authorization)
            when(oidcClient.pollForToken(anything(), anything(), anything())).thenResolve(token)

            return { token, registration, authorization }
        }

        it('runs the full SSO flow', async function () {
            const { token, registration } = setupFlow()
            stubOpen()

            assert.deepStrictEqual(await sut.createToken(), token)

            const cachedToken = await cache
                .getTokenCache()
                .load(startUrl)
                .then(a => a?.token)
            assert.deepStrictEqual(cachedToken, token)
            assert.deepStrictEqual(await cache.getRegistrationCache().load({ region }), registration)
        })

        it('always creates a new token, even if already cached', async function () {
            const { token } = setupFlow()
            stubOpen()

            const cachedToken = createToken(HOUR_IN_MS, { accessToken: 'someOtherToken' })
            await cache.getTokenCache().save(startUrl, { region, startUrl, token: cachedToken })

            assert.deepStrictEqual(await sut.createToken(), token)
            assert.deepStrictEqual(await sut.getToken(), token)
            assert.notDeepStrictEqual(await sut.getToken(), cachedToken)
        })

        describe('Exceptions', function () {
            it('removes the client registration cache on client faults', async function () {
                const exception = new UnauthorizedClientException({ $metadata: {} })
                const registration = createRegistration(HOUR_IN_MS)

                when(oidcClient.registerClient(anything())).thenResolve(registration)
                when(oidcClient.startDeviceAuthorization(anything())).thenReject(exception)

                await assert.rejects(sut.createToken(), exception)
                assert.strictEqual(await cache.getRegistrationCache().load({ region }), undefined)
            })

            it('removes the client registration cache on client faults (token step)', async function () {
                const exception = new InvalidClientException({ $metadata: {} })
                const registration = createRegistration(HOUR_IN_MS)

                when(oidcClient.registerClient(anything())).thenResolve(registration)
                when(oidcClient.startDeviceAuthorization(anything())).thenResolve(createAuthorization(HOUR_IN_MS))
                when(oidcClient.pollForToken(anything(), anything(), anything())).thenReject(exception)

                stubOpen()

                await assert.rejects(sut.createToken(), exception)
                assert.strictEqual(await cache.getRegistrationCache().load({ region }), undefined)
            })

            it('preserves the client registration cache on server faults', async function () {
                const exception = new InternalServerException({ $metadata: {} })
                const registration = createRegistration(HOUR_IN_MS)

                when(oidcClient.registerClient(anything())).thenResolve(registration)
                when(oidcClient.startDeviceAuthorization(anything())).thenReject(exception)

                await assert.rejects(sut.createToken(), exception)
                assert.deepStrictEqual(await cache.getRegistrationCache().load({ region }), registration)
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
                const registration = createRegistration(HOUR_IN_MS)
                await cache.getRegistrationCache().save({ region }, registration)
                await assert.rejects(sut.createToken(), CancellationError)
                const cached = await cache.getRegistrationCache().load({ region })
                assert.deepStrictEqual(cached, registration)
            })
        })
    })
})
