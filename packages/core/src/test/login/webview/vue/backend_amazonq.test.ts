/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SinonSandbox, createSandbox } from 'sinon'
import { assertTelemetry, tryRegister } from '../../../testUtil'
import assert from 'assert'
import { createBuilderIdProfile, createSsoProfile, createTestAuth } from '../../../credentials/testUtil'
import { Auth } from '../../../../auth'
import { AmazonQLoginWebview } from '../../../../login/webview/vue/amazonq/backend_amazonq'
import { isBuilderIdConnection, isIdcSsoConnection } from '../../../../auth/connection'
import { amazonQScopes, AuthUtil } from '../../../../codewhisperer/util/authUtil'
import { getOpenExternalStub } from '../../../globalSetup.test'
import { openAmazonQWalkthrough } from '../../../../amazonq/onboardingPage/walkthrough'

// TODO: remove auth page and tests
describe('Amazon Q Login', function () {
    const region = 'fakeRegion'
    const startUrl = 'fakeUrl'

    let sandbox: SinonSandbox
    let auth: ReturnType<typeof createTestAuth>
    let authUtil: AuthUtil
    let backend: AmazonQLoginWebview

    before(function () {
        tryRegister(openAmazonQWalkthrough)
    })

    beforeEach(function () {
        sandbox = createSandbox()
        auth = createTestAuth()
        authUtil = new AuthUtil(auth)
        sandbox.stub(Auth, 'instance').value(auth)
        sandbox.stub(AuthUtil, 'instance').value(authUtil)
        getOpenExternalStub().resolves(true)

        backend = new AmazonQLoginWebview()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('signs into builder ID and emits telemetry', async function () {
        await backend.startBuilderIdSetup()

        assert.ok(isBuilderIdConnection(auth.activeConnection))
        assert.deepStrictEqual(auth.activeConnection.scopes, amazonQScopes)
        assert.deepStrictEqual(auth.activeConnection.state, 'valid')

        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            credentialSourceId: 'awsId',
            authEnabledFeatures: 'codewhisperer',
            isReAuth: false,
        })
    })

    it('signs into IdC and emits telemetry', async function () {
        await backend.startEnterpriseSetup(startUrl, region)

        assert.ok(isIdcSsoConnection(auth.activeConnection))
        assert.deepStrictEqual(auth.activeConnection.scopes, amazonQScopes)
        assert.deepStrictEqual(auth.activeConnection.state, 'valid')
        assert.deepStrictEqual(auth.activeConnection.startUrl, startUrl)
        assert.deepStrictEqual(auth.activeConnection.ssoRegion, region)

        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            credentialSourceId: 'iamIdentityCenter',
            authEnabledFeatures: 'codewhisperer',
            credentialStartUrl: startUrl,
            awsRegion: region,
            isReAuth: false,
        })
    })

    it('reauths builder ID and emits telemetry', async function () {
        const conn = await auth.createInvalidSsoConnection(createBuilderIdProfile({ scopes: amazonQScopes }))
        await auth.useConnection(conn)

        // method under test
        await backend.reauthenticateConnection()

        assert.deepStrictEqual(auth.activeConnection?.state, 'valid')

        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            credentialSourceId: 'awsId',
            authEnabledFeatures: 'codewhisperer',
            isReAuth: true,
        })
    })

    it('reauths IdC and emits telemetry', async function () {
        const conn = await auth.createInvalidSsoConnection(
            createSsoProfile({ scopes: amazonQScopes, startUrl, ssoRegion: region })
        )
        await auth.useConnection(conn)

        // method under test
        await backend.reauthenticateConnection()

        assert.deepStrictEqual(auth.activeConnection?.state, 'valid')

        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            credentialSourceId: 'iamIdentityCenter',
            authEnabledFeatures: 'codewhisperer',
            credentialStartUrl: startUrl,
            awsRegion: region,
            isReAuth: true,
        })
    })

    it('signs out of reauth and emits telemetry', async function () {
        const conn = await auth.createInvalidSsoConnection(
            createSsoProfile({ scopes: amazonQScopes, startUrl, ssoRegion: region })
        )
        await auth.useConnection(conn)

        // method under test
        await backend.signout()

        assert.equal(auth.activeConnection, undefined)

        assertTelemetry('auth_addConnection', {
            result: 'Cancelled',
            credentialSourceId: 'iamIdentityCenter',
            authEnabledFeatures: 'codewhisperer',
            credentialStartUrl: startUrl,
            awsRegion: region,
            isReAuth: true,
        })
    })
})
