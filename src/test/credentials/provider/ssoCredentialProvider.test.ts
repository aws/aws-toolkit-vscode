/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as messages from '../../../shared/utilities/messages'
import { SSO, SSOServiceException, UnauthorizedException } from '@aws-sdk/client-sso'
import { SsoAccessTokenProvider } from '../../../credentials/sso/ssoAccessTokenProvider'
import { instance, mock, when, reset, anything, verify } from '../../utilities/mockito'
import { SsoClient } from '../../../credentials/sso/clients'
import { SsoProvider } from '../../../credentials/providers/ssoCredentialProvider'

describe('SsoProvider', () => {
    const profileName = 'sso' as const
    const ssoClient = mock(SSO)
    const tokenProvider = mock(SsoAccessTokenProvider)

    const profile = {
        ['sso_start_url']: 'https://d-92a70fe14d.awsapps.com/start',
        ['sso_region']: 'us-east-1',
        ['sso_account_id']: '01234567890',
        ['sso_role_name']: 'AssumeRole',
    }

    let provider: SsoProvider

    function createToken() {
        return { accessToken: 'token', expiresAt: new Date() }
    }

    before(function () {
        const tokenProviderInstance = instance(tokenProvider)
        const ssoClientInstance = instance(ssoClient)
        ssoClientInstance.middlewareStack = { add: () => {} } as any

        sinon.stub(SsoClient, 'create').returns(new SsoClient(ssoClientInstance, tokenProviderInstance))
        sinon.stub(SsoAccessTokenProvider, 'create').returns(tokenProviderInstance)
        sinon.stub(messages, 'showConfirmationMessage').resolves(true)
    })

    after(function () {
        sinon.restore()
    })

    beforeEach(function () {
        provider = new SsoProvider(profileName, { ...profile })
    })

    afterEach(function () {
        reset(ssoClient)
        reset(tokenProvider)
    })

    describe('getCredentials', () => {
        it('invalidates cached access token if denied', async function () {
            const exception = new UnauthorizedException({ $metadata: {} })

            when(ssoClient.getRoleCredentials(anything())).thenReject(exception)
            when(tokenProvider.getToken()).thenResolve(createToken())
            when(tokenProvider.invalidate()).thenResolve()

            await assert.rejects(provider.getCredentials(), exception)
            verify(tokenProvider.invalidate()).once()
        })

        it('keeps cached token on server faults', async function () {
            const exception = new SSOServiceException({ name: 'ServerError', $fault: 'server', $metadata: {} })
            const provider = new SsoProvider(profileName, profile)

            when(ssoClient.getRoleCredentials(anything())).thenReject(exception)
            when(tokenProvider.getToken()).thenResolve(createToken())

            await assert.rejects(provider.getCredentials(), exception)
            verify(tokenProvider.invalidate()).never()
        })

        it('returns valid credentials', async () => {
            const roleCredentials = {
                expiration: 999,
                accessKeyId: 'id',
                secretAccessKey: 'secret',
                sessionToken: 'session',
            }

            when(ssoClient.getRoleCredentials(anything())).thenResolve({ $metadata: {}, roleCredentials })
            when(tokenProvider.getToken()).thenResolve(createToken())

            assert.deepStrictEqual(await provider.getCredentials(), {
                ...roleCredentials,
                expiration: new Date(roleCredentials.expiration),
            })
        })
    })

    describe('auto-connect', function () {
        it('can auto-connect if a valid token is available', async function () {
            when(tokenProvider.getToken()).thenResolve(createToken())
            assert.strictEqual(await provider.canAutoConnect(), true)
        })

        it('does not auto-connect when no token is present', async function () {
            when(tokenProvider.getToken()).thenResolve(undefined)
            assert.strictEqual(await provider.canAutoConnect(), false)
        })

        it('does not auto-connect when `sso_start_url` is missing', async function () {
            when(tokenProvider.getToken()).thenResolve(createToken())

            const profileCopy = { ...profile, ['sso_start_url']: undefined }
            const provider = new SsoProvider(profileName, profileCopy)

            assert.strictEqual(await provider.canAutoConnect(), false)
        })

        it('does not auto-connect when `sso_region` is missing', async function () {
            when(tokenProvider.getToken()).thenResolve(createToken())

            const profileCopy = { ...profile, ['sso_region']: undefined }
            const provider = new SsoProvider(profileName, profileCopy)

            assert.strictEqual(await provider.canAutoConnect(), false)
        })
    })
})
