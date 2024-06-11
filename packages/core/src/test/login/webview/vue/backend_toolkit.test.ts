/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SinonSandbox, createSandbox } from 'sinon'
import { assertTelemetry, tryRegister } from '../../../testUtil'
import assert from 'assert'
import { createTestAuth } from '../../../credentials/testUtil'
import { Auth } from '../../../../auth'
import { isBuilderIdConnection, isIdcSsoConnection, scopesSsoAccountAccess } from '../../../../auth/connection'
import { getOpenExternalStub } from '../../../globalSetup.test'
import { openAmazonQWalkthrough } from '../../../../amazonq/onboardingPage/walkthrough'
import { ToolkitLoginWebview } from '../../../../login/webview/vue/toolkit/backend_toolkit'
import {
    CodeCatalystAuthenticationProvider,
    CodeCatalystAuthStorage,
    defaultScopes,
} from '../../../../codecatalyst/auth'
import { FakeSecretStorage, FakeMemento } from '../../../fakeExtensionContext'
import * as authUtils from '../../../../auth/utils'

// TODO: remove auth page and tests
describe('Toolkit Login', function () {
    const region = 'fakeRegion'
    const startUrl = 'fakeUrl'
    const profileName = 'profile'
    const accessKey = 'fakeKey'
    const secretKey = 'fakeSecret'

    let sandbox: SinonSandbox
    let auth: ReturnType<typeof createTestAuth>
    let codecatalystAuth: CodeCatalystAuthenticationProvider
    let backend: ToolkitLoginWebview

    before(function () {
        tryRegister(openAmazonQWalkthrough)
    })

    beforeEach(function () {
        sandbox = createSandbox()
        auth = createTestAuth()
        codecatalystAuth = new CodeCatalystAuthenticationProvider(
            new CodeCatalystAuthStorage(new FakeSecretStorage()),
            new FakeMemento(),
            auth
        )
        sandbox.stub(Auth, 'instance').value(auth)
        getOpenExternalStub().resolves(true)

        backend = new ToolkitLoginWebview(codecatalystAuth)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('signs into builder ID and emits telemetry', async function () {
        sandbox.stub(codecatalystAuth, 'isConnectionOnboarded').resolves(true)

        await backend.startBuilderIdSetup()

        assert.ok(isBuilderIdConnection(auth.activeConnection))
        assert.deepStrictEqual(auth.activeConnection.scopes, defaultScopes)
        assert.deepStrictEqual(auth.activeConnection.state, 'valid')

        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            credentialSourceId: 'awsId',
            authEnabledFeatures: 'codecatalyst',
            isReAuth: false,
        })
    })

    it('signs into account IdC and emits telemetry', async function () {
        await backend.startEnterpriseSetup(startUrl, region)

        assert.ok(isIdcSsoConnection(auth.activeConnection))
        assert.deepStrictEqual(auth.activeConnection.scopes, scopesSsoAccountAccess)
        assert.deepStrictEqual(auth.activeConnection.state, 'valid')
        assert.deepStrictEqual(auth.activeConnection.startUrl, startUrl)
        assert.deepStrictEqual(auth.activeConnection.ssoRegion, region)

        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            credentialSourceId: 'iamIdentityCenter',
            authEnabledFeatures: 'awsExplorer',
            credentialStartUrl: startUrl,
            awsRegion: region,
            isReAuth: false,
        })
    })

    it('signs into codecatalyst IdC and emits telemetry', async function () {
        sandbox.stub(codecatalystAuth, 'isConnectionOnboarded').resolves(true)
        backend.setLoginService('codecatalyst')

        await backend.startEnterpriseSetup(startUrl, region)

        assert.ok(isIdcSsoConnection(auth.activeConnection))
        assert.deepStrictEqual(auth.activeConnection.scopes, defaultScopes)
        assert.deepStrictEqual(auth.activeConnection.state, 'valid')
        assert.deepStrictEqual(auth.activeConnection.startUrl, startUrl)
        assert.deepStrictEqual(auth.activeConnection.ssoRegion, region)

        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            credentialSourceId: 'iamIdentityCenter',
            authEnabledFeatures: 'codecatalyst,awsExplorer',
            credentialStartUrl: startUrl,
            awsRegion: region,
            isReAuth: false,
        })
    })

    it('signs in with Iam credentials and emits telemetry', async function () {
        sandbox.stub(auth, 'authenticateData').resolves()
        const stub = sandbox.stub(authUtils, 'tryAddCredentials').resolves()
        await backend.startIamCredentialSetup(profileName, accessKey, secretKey)

        assert.ok(stub.calledOnceWith(profileName, { aws_access_key_id: accessKey, aws_secret_access_key: secretKey }))
        assertTelemetry('auth_addConnection', {
            result: 'Succeeded',
            credentialSourceId: 'sharedCredentials',
            authEnabledFeatures: 'awsExplorer',
        })
    })
})
