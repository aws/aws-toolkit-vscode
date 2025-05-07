/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { assertTelemetry, createTestAuthUtil } from 'aws-core-vscode/test'
import { AuthUtil, awsIdSignIn, getStartUrl } from 'aws-core-vscode/codewhisperer'
import { backendAmazonQ } from 'aws-core-vscode/login'

describe('Amazon Q Login', async function () {
    const region = 'fakeRegion'
    const startUrl = 'fakeUrl'

    let sandbox: sinon.SinonSandbox
    let backend: backendAmazonQ.AmazonQLoginWebview

    await createTestAuthUtil()

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        backend = new backendAmazonQ.AmazonQLoginWebview()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('signs into builder ID and emits telemetry', async function () {
        await backend.startBuilderIdSetup()

        assert.ok(AuthUtil.instance.isConnected())
        assert.ok(AuthUtil.instance.isBuilderIdConnection())

        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            credentialSourceId: 'awsId',
            authEnabledFeatures: 'codewhisperer',
            isReAuth: false,
            ssoRegistrationExpiresAt: undefined,
            ssoRegistrationClientId: undefined,
        })
    })

    it('signs into IdC and emits telemetry', async function () {
        await backend.startEnterpriseSetup(startUrl, region)

        assert.ok(AuthUtil.instance.isConnected())
        assert.ok(AuthUtil.instance.isIdcConnection())
        assert.ok(AuthUtil.instance.isSsoSession())
        assert.deepStrictEqual(AuthUtil.instance.connection?.startUrl, startUrl)
        assert.deepStrictEqual(AuthUtil.instance.connection?.region, region)

        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            credentialSourceId: 'iamIdentityCenter',
            authEnabledFeatures: 'codewhisperer',
            credentialStartUrl: startUrl,
            awsRegion: region,
            isReAuth: false,
            ssoRegistrationExpiresAt: undefined,
            ssoRegistrationClientId: undefined,
        })
    })

    it('reauths builder ID and emits telemetry', async function () {
        await awsIdSignIn()

        await backend.reauthenticateConnection()

        assert.ok(AuthUtil.instance.isConnected())

        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            credentialSourceId: 'awsId',
            authEnabledFeatures: 'codewhisperer',
            isReAuth: true,
            ssoRegistrationExpiresAt: undefined,
            ssoRegistrationClientId: undefined,
        })
    })

    it('reauths IdC and emits telemetry', async function () {
        await getStartUrl.connectToEnterpriseSso(startUrl, region)

        await backend.reauthenticateConnection()

        assert.ok(AuthUtil.instance.isConnected())

        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            credentialSourceId: 'iamIdentityCenter',
            authEnabledFeatures: 'codewhisperer',
            credentialStartUrl: startUrl,
            awsRegion: region,
            isReAuth: true,
            ssoRegistrationExpiresAt: undefined,
            ssoRegistrationClientId: undefined,
        })
    })

    it('signs out of reauth and emits telemetry', async function () {
        await backend.signout()

        assert.ok(!AuthUtil.instance.isConnected())

        assertTelemetry('auth_addConnection', {
            result: 'Cancelled',
            credentialSourceId: 'iamIdentityCenter',
            authEnabledFeatures: 'codewhisperer',
            credentialStartUrl: startUrl,
            awsRegion: region,
            isReAuth: true,
            ssoRegistrationExpiresAt: undefined,
            ssoRegistrationClientId: undefined,
        })
    })
})
