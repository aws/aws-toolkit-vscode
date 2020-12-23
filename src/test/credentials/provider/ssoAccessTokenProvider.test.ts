/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as lolex from 'lolex'
import * as SDK from 'aws-sdk'
import * as sinon from 'sinon'
import { DiskCache } from '../../../credentials/sso/diskCache'
import { SsoAccessTokenProvider } from '../../../credentials/sso/ssoAccessTokenProvider'
import { CreateTokenResponse, StartDeviceAuthorizationResponse } from 'aws-sdk/clients/ssooidc'
import { SsoClientRegistration } from '../../../credentials/sso/ssoClientRegistration'
import { assertThrowsError } from '../../../test/shared/utilities/assertUtils'

describe('SsoAccessTokenProvider', () => {
    const sandbox = sinon.createSandbox()

    const ssoRegion = 'fakeRegion'
    const ssoUrl = 'fakeUrl'
    const ssoOidcClient = new SDK.SSOOIDC({ region: 'us-west-2' })
    const cache = new DiskCache()
    const sut = new SsoAccessTokenProvider(ssoRegion, ssoUrl, ssoOidcClient, cache)

    const HOUR_IN_MS = 3600000

    const validAccessToken = {
        startUrl: ssoUrl,
        region: ssoRegion,
        accessToken: 'dummyAccessToken',
        expiresAt: new Date(Date.now() + HOUR_IN_MS).toISOString(),
    }

    const fakeCreateTokenResponse: SDK.SSOOIDC.CreateTokenResponse = {
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

    let clock: lolex.InstalledClock

    before(() => {
        clock = lolex.install()
    })

    afterEach(async () => {
        sandbox.restore()
        clock.reset()
    })

    after(() => {
        clock.uninstall()
    })

    describe('accessToken', () => {
        it('should return a cached token', async () => {
            sandbox.stub(cache, 'loadAccessToken').returns(validAccessToken)

            const receivedToken = await sut.accessToken()

            assert.strictEqual(receivedToken, validAccessToken)
        })

        it('should create a new access token with a cached client registration', async () => {
            setUpStubCache(validRegistation)
            const stubAuthorizeClient = sandbox.stub(sut, 'authorizeClient').resolves(validAuthorization)

            sandbox.stub(ssoOidcClient, 'createToken').returns(({
                promise: sandbox.stub().resolves(fakeCreateTokenResponse),
            } as any) as SDK.Request<CreateTokenResponse, SDK.AWSError>)

            const stubSaveAccessToken = sandbox.stub(cache, 'saveAccessToken').returns()

            const receivedToken = await sut.accessToken()

            assert.strictEqual(receivedToken.startUrl, validAccessToken.startUrl)
            assert.strictEqual(receivedToken.region, validAccessToken.region)
            assert.strictEqual(receivedToken.accessToken, validAccessToken.accessToken)

            assert.strictEqual(stubSaveAccessToken.calledOnce, true)
            assert.strictEqual(stubAuthorizeClient.calledOnce, true)
        })

        it('should create an access token without caches', async () => {
            setUpStubCache()
            const stubRegisterClient = sandbox.stub(sut, 'registerClient').resolves(validRegistation)
            const stubAuthorizeClient = sandbox.stub(sut, 'authorizeClient').resolves(validAuthorization)

            const stubCreateToken = sandbox.stub(ssoOidcClient, 'createToken').returns(({
                promise: sandbox.stub().resolves(fakeCreateTokenResponse),
            } as any) as SDK.Request<CreateTokenResponse, SDK.AWSError>)

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

        it('should create access token after multiple polls', async () => {
            setUpStubCache()
            sandbox.stub(sut, 'registerClient').resolves(validRegistation)
            sandbox.stub(sut, 'authorizeClient').resolves(validAuthorization)

            const stubCreateToken = sandbox.stub(ssoOidcClient, 'createToken')
            stubCreateToken.onFirstCall().returns(({
                promise: sandbox.stub().throws({ code: 'AuthorizationPendingException' }),
            } as any) as SDK.Request<CreateTokenResponse, SDK.AWSError>)
            clock.nextAsync()

            stubCreateToken.onSecondCall().returns(({
                promise: sandbox.stub().resolves(fakeCreateTokenResponse),
            } as any) as SDK.Request<CreateTokenResponse, SDK.AWSError>)

            const stubSaveAccessToken = sandbox.stub(cache, 'saveAccessToken').returns()

            const startTime = Date.now()
            const receivedToken = await sut.accessToken()
            const endTime = Date.now()

            const durationInSeconds = (endTime - startTime) / 1000

            assert.strictEqual(durationInSeconds >= 1, true)

            assert.strictEqual(receivedToken.startUrl, validAccessToken.startUrl)
            assert.strictEqual(receivedToken.region, validAccessToken.region)
            assert.strictEqual(receivedToken.accessToken, validAccessToken.accessToken)

            assert.strictEqual(stubSaveAccessToken.calledOnce, true)
        })

        it('should stop polling for unspecified errors during createToken call', async () => {
            setUpStubCache(validRegistation)
            sandbox.stub(sut, 'authorizeClient').resolves(validAuthorization)

            const errToThrow = new Error() as SDK.AWSError

            const stubCreateToken = sandbox.stub(ssoOidcClient, 'createToken')
            stubCreateToken.returns(({
                promise: sandbox.stub().throws(errToThrow),
            } as any) as SDK.Request<CreateTokenResponse, SDK.AWSError>)

            const stubSaveAccessToken = sandbox.stub(cache, 'saveAccessToken').returns()

            await assertThrowsError(async () => {
                await sut.accessToken()
            })

            assert.strictEqual(stubCreateToken.callCount, 1)
            assert.strictEqual(stubSaveAccessToken.called, false)
        })

        it('should add backoff delay on SlowDownException', async () => {
            setUpStubCache(validRegistation)
            sandbox.stub(sut, 'authorizeClient').resolves(validAuthorization)

            const stubCreateToken = sandbox.stub(ssoOidcClient, 'createToken')
            stubCreateToken.onFirstCall().returns(({
                promise: sandbox.stub().throws({ code: 'SlowDownException' }),
            } as any) as SDK.Request<CreateTokenResponse, SDK.AWSError>)
            clock.nextAsync()

            stubCreateToken.onSecondCall().returns(({
                promise: sandbox.stub().resolves(fakeCreateTokenResponse),
            } as any) as SDK.Request<CreateTokenResponse, SDK.AWSError>)

            const stubSaveAccessToken = sandbox.stub(cache, 'saveAccessToken').returns()

            const startTime = Date.now()
            const returnedToken = await sut.accessToken()
            const endTime = Date.now()

            const durationInSeconds = (endTime - startTime) / 1000

            //The default backoff delay is 5 seconds, the starting retry interval is 1 second
            assert.strictEqual(durationInSeconds >= 6, true, 'Duration not over 6 seconds')
            assert.strictEqual(returnedToken.startUrl, validAccessToken.startUrl)
            assert.strictEqual(returnedToken.region, validAccessToken.region)
            assert.strictEqual(returnedToken.accessToken, validAccessToken.accessToken)

            assert.strictEqual(stubSaveAccessToken.calledOnce, true, 'Access token not saved')
        })
    })

    describe('authorizeClient', () => {
        it('should remove the client registration cache on InvalidClientException', async () => {
            const errToThrow = new Error() as SDK.AWSError
            errToThrow.code = 'InvalidClientException'

            const stubSsoOidcClient = sandbox.stub(ssoOidcClient, 'startDeviceAuthorization')
            stubSsoOidcClient.returns(({
                promise: sandbox.stub().throws(errToThrow),
            } as any) as SDK.Request<CreateTokenResponse, SDK.AWSError>)

            const stubInvalidateCache = sandbox.stub(cache, 'invalidateClientRegistration').returns()

            const dummyRegistration = {
                clientId: 'badClient',
                clientSecret: 'badSecret',
                expiresAt: new Date(Date.now() + HOUR_IN_MS).toISOString(),
            }

            await assertThrowsError(async () => {
                await sut.authorizeClient(dummyRegistration)
            })

            assert.strictEqual(stubInvalidateCache.callCount, 1)
        })
    })
})
