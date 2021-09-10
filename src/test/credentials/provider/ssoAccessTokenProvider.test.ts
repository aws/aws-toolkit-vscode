/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as SSOOIDC from '@aws-sdk/client-sso-oidc'
import * as sinon from 'sinon'
import { DiskCache } from '../../../credentials/sso/diskCache'
import { SsoAccessTokenProvider } from '../../../credentials/sso/ssoAccessTokenProvider'
import { StartDeviceAuthorizationResponse } from 'aws-sdk/clients/ssooidc'
import { SsoClientRegistration } from '../../../credentials/sso/ssoClientRegistration'

describe('SsoAccessTokenProvider', function () {
    const sandbox = sinon.createSandbox()

    const ssoRegion = 'fakeRegion'
    const ssoUrl = 'fakeUrl'
    const ssoOidcClient = new SSOOIDC.SSOOIDC({ region: 'us-west-2' })
    const cache = new DiskCache()
    const sut = new SsoAccessTokenProvider(ssoRegion, ssoUrl, ssoOidcClient, cache)

    const HOUR_IN_MS = 3600000

    const validAccessToken = {
        startUrl: ssoUrl,
        region: ssoRegion,
        accessToken: 'dummyAccessToken',
        expiresAt: new Date(Date.now() + HOUR_IN_MS).toISOString(),
    }

    const fakeCreateTokenResponse: SSOOIDC.CreateTokenResponse = {
        accessToken: 'dummyAccessToken',
        expiresIn: 120,
    }

    const validRegistation: SsoClientRegistration = {
        clientId: 'aString',
        clientSecret: 'aString',
        expiresAt: new Date(Date.now() + HOUR_IN_MS).toISOString(),
    }

    const validAuthorization: StartDeviceAuthorizationResponse = {
        expiresIn: 120,
        deviceCode: 'dummyCode',
        userCode: 'dummyUserCode',
        verificationUri: 'aUrl',
        verificationUriComplete: 'aUrlComplete',
        interval: 1,
    }

    function setUpStubCache(returnRegistration?: SsoClientRegistration) {
        if (returnRegistration) {
            sandbox.stub(cache, 'loadClientRegistration').returns(returnRegistration)
        } else {
            sandbox.stub(cache, 'loadClientRegistration').returns(undefined)
        }

        sandbox.stub(cache, 'loadAccessToken').returns(undefined)

        sandbox.stub(cache, 'saveClientRegistration').returns()
    }

    let clock: FakeTimers.InstalledClock

    before(function () {
        clock = FakeTimers.install()
    })

    afterEach(async function () {
        sandbox.restore()
        clock.reset()
    })

    after(function () {
        clock.uninstall()
    })

    describe('accessToken', function () {
        it('returns a cached token', async function () {
            sandbox.stub(cache, 'loadAccessToken').returns(validAccessToken)

            const receivedToken = await sut.accessToken()

            assert.strictEqual(receivedToken, validAccessToken)
        })

        it('creates a new access token with a cached client registration', async function () {
            setUpStubCache(validRegistation)
            const stubAuthorizeClient = sandbox.stub(sut, 'authorizeClient').resolves(validAuthorization)

            sandbox.stub(ssoOidcClient, 'createToken').resolves(fakeCreateTokenResponse)

            const stubSaveAccessToken = sandbox.stub(cache, 'saveAccessToken').returns()

            const receivedToken = await sut.accessToken()

            assert.strictEqual(receivedToken.startUrl, validAccessToken.startUrl)
            assert.strictEqual(receivedToken.region, validAccessToken.region)
            assert.strictEqual(receivedToken.accessToken, validAccessToken.accessToken)

            assert.strictEqual(stubSaveAccessToken.calledOnce, true)
            assert.strictEqual(stubAuthorizeClient.calledOnce, true)
        })

        it('creates an access token without caches', async function () {
            setUpStubCache()
            const stubRegisterClient = sandbox.stub(sut, 'registerClient').resolves(validRegistation)
            const stubAuthorizeClient = sandbox.stub(sut, 'authorizeClient').resolves(validAuthorization)

            const stubCreateToken = sandbox.stub(ssoOidcClient, 'createToken').resolves(fakeCreateTokenResponse)

            const stubSaveAccessToken = sandbox.stub(cache, 'saveAccessToken').returns()

            const receivedToken = await sut.accessToken()

            assert.strictEqual(receivedToken.startUrl, validAccessToken.startUrl)
            assert.strictEqual(receivedToken.region, validAccessToken.region)
            assert.strictEqual(receivedToken.accessToken, validAccessToken.accessToken)

            assert.strictEqual(stubRegisterClient.calledOnce, true)
            assert.strictEqual(stubAuthorizeClient.calledOnce, true)
            assert.strictEqual(stubCreateToken.calledOnce, true)
            assert.strictEqual(stubSaveAccessToken.calledOnce, true)
        })

        it('creates access token after multiple polls', async function () {
            setUpStubCache()
            sandbox.stub(sut, 'registerClient').resolves(validRegistation)
            sandbox.stub(sut, 'authorizeClient').resolves(validAuthorization)

            const stubCreateToken = sandbox.stub(ssoOidcClient, 'createToken')
            stubCreateToken.onFirstCall().rejects({ name: 'AuthorizationPendingException' })

            stubCreateToken.onSecondCall().resolves(fakeCreateTokenResponse)

            const stubSaveAccessToken = sandbox.stub(cache, 'saveAccessToken').returns()

            const startTime = Date.now()
            const tokenPromise = sut.accessToken()
            clock.runAllAsync()
            const receivedToken = await tokenPromise
            const endTime = Date.now()

            const durationInSeconds = (endTime - startTime) / 1000

            assert.strictEqual(durationInSeconds >= 1, true)

            assert.strictEqual(receivedToken.startUrl, validAccessToken.startUrl)
            assert.strictEqual(receivedToken.region, validAccessToken.region)
            assert.strictEqual(receivedToken.accessToken, validAccessToken.accessToken)

            assert.strictEqual(stubSaveAccessToken.calledOnce, true)
        })

        it('stops polling for unspecified errors during createToken call', async function () {
            setUpStubCache(validRegistation)
            sandbox.stub(sut, 'authorizeClient').resolves(validAuthorization)

            const errToThrow = new Error()

            const stubCreateToken = sandbox.stub(ssoOidcClient, 'createToken')
            stubCreateToken.rejects(errToThrow)

            const stubSaveAccessToken = sandbox.stub(cache, 'saveAccessToken').returns()

            await assert.rejects(sut.accessToken())

            assert.strictEqual(stubCreateToken.callCount, 1)
            assert.strictEqual(stubSaveAccessToken.called, false)
        })

        it('adds backoff delay on SlowDownException', async function () {
            setUpStubCache(validRegistation)
            sandbox.stub(sut, 'authorizeClient').resolves(validAuthorization)

            const stubCreateToken = sandbox.stub(ssoOidcClient, 'createToken')
            stubCreateToken.onFirstCall().rejects({ name: 'SlowDownException' })

            stubCreateToken.onSecondCall().resolves(fakeCreateTokenResponse)

            const stubSaveAccessToken = sandbox.stub(cache, 'saveAccessToken').returns()

            const startTime = Date.now()
            const tokenPromise = sut.accessToken()
            clock.runAllAsync()
            const receivedToken = await tokenPromise
            const endTime = Date.now()

            const durationInSeconds = (endTime - startTime) / 1000

            //The default backoff delay is 5 seconds, the starting retry interval is 1 second
            assert.strictEqual(durationInSeconds >= 6, true, 'Duration not over 6 seconds')
            assert.strictEqual(receivedToken.startUrl, validAccessToken.startUrl)
            assert.strictEqual(receivedToken.region, validAccessToken.region)
            assert.strictEqual(receivedToken.accessToken, validAccessToken.accessToken)

            assert.strictEqual(stubSaveAccessToken.calledOnce, true, 'Access token not saved')
        })
    })

    describe('authorizeClient', function () {
        it('removes the client registration cache on InvalidClientException', async function () {
            const errToThrow = { code: 'InvalidClientException' }

            const stubSsoOidcClient = sandbox.stub(ssoOidcClient, 'startDeviceAuthorization')
            stubSsoOidcClient.rejects(errToThrow)

            const stubInvalidateCache = sandbox.stub(cache, 'invalidateClientRegistration').returns()

            const dummyRegistration = {
                clientId: 'badClient',
                clientSecret: 'badSecret',
                expiresAt: new Date(Date.now() + HOUR_IN_MS).toISOString(),
            }

            await assert.rejects(sut.authorizeClient(dummyRegistration))

            assert.strictEqual(stubInvalidateCache.callCount, 1)
        })
    })
})
