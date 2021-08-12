/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { SSO } from '@aws-sdk/client-sso'
import { SSOOIDC } from '@aws-sdk/client-sso-oidc'
import { SsoCredentialProvider } from '../../../credentials/providers/ssoCredentialProvider'
import { SsoAccessTokenProvider } from '../../../credentials/sso/ssoAccessTokenProvider'
import { DiskCache } from '../../../credentials/sso/diskCache'
import { GetRoleCredentialsResponse } from 'aws-sdk/clients/sso'

describe('SsoCredentialProvider', () => {
    describe('refreshCredentials', () => {
        const sandbox = sinon.createSandbox()

        const ssoRegion = 'dummyRegion'
        const ssoUrl = '123abc.com/start'
        const ssoOidcClient = new SSOOIDC({ region: ssoRegion })
        const cache = new DiskCache()
        const ssoAccessTokenProvider = new SsoAccessTokenProvider(ssoRegion, ssoUrl, ssoOidcClient, cache)

        const ssoAccount = 'dummyAccount'
        const ssoRole = 'dummyRole'
        const ssoClient = new SSO({ region: ssoRegion })
        const sut = new SsoCredentialProvider(ssoAccount, ssoRole, ssoClient, ssoAccessTokenProvider)

        const HOUR_IN_MS = 3600000
        const validAccessToken = {
            startUrl: ssoUrl,
            region: ssoRegion,
            accessToken: 'dummyAccessToken',
            expiresAt: new Date(Date.now() + HOUR_IN_MS).toISOString(),
        }

        afterEach(() => {
            sandbox.restore()
        })

        it('invalidates cached access token if denied', async () => {
            const stubAccessToken = sandbox.stub(ssoAccessTokenProvider, 'accessToken').resolves(validAccessToken)
            const stubSsoClient = sandbox.stub(ssoClient, 'getRoleCredentials')

            stubSsoClient.rejects({ code: 'UnauthorizedException' })

            const stubInvalidate = sandbox.stub(ssoAccessTokenProvider, 'invalidate').returns()

            await assert.rejects(sut.refreshCredentials())

            assert.strictEqual(stubAccessToken.callCount, 1, 'accessToken not called')
            assert.strictEqual(stubSsoClient.callCount, 1, 'getRoleCredentials not called')
            assert.strictEqual(stubInvalidate.callCount, 1, 'invalidate not called')
        })

        it('returns valid credentials', async () => {
            sandbox.stub(ssoAccessTokenProvider, 'accessToken').resolves(validAccessToken)
            const response: GetRoleCredentialsResponse = {
                roleCredentials: {
                    accessKeyId: 'dummyAccessKeyId',
                    secretAccessKey: 'dummySecretAccessKey',
                    sessionToken: 'dummySessionToken',
                },
            }
            const stubSsoClient = sandbox.stub(ssoClient, 'getRoleCredentials')
            stubSsoClient.resolves(response)

            const receivedCredentials = await sut.refreshCredentials()

            assert.strictEqual(receivedCredentials.accessKeyId, response.roleCredentials?.accessKeyId)
            assert.strictEqual(receivedCredentials.secretAccessKey, response.roleCredentials?.secretAccessKey)
            assert.strictEqual(receivedCredentials.sessionToken, response.roleCredentials?.sessionToken)
        })
    })
})
