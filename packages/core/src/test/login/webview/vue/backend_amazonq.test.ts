/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// // import { assertTelemetry } from '../../../testUtil'
// import assert from 'assert'
// import { AmazonQLoginWebview } from '../../../../login/webview/vue/amazonq/backend_amazonq'
// import { AuthUtil } from '../../../../codewhisperer/util/authUtil'
// import * as sinon from 'sinon'
// import { LanguageClientAuth } from '../../../../auth/auth2'

// describe('Amazon Q Login', function () {
//     const region = 'fakeRegion'
//     const startUrl = 'fakeUrl'

//     let sandbox: sinon.SinonSandbox
//     let backend: AmazonQLoginWebview

//     const mockLspAuth: Partial<LanguageClientAuth> = {
//         registerSsoTokenChangedHandler: sinon.stub().resolves(),
//     };
//     AuthUtil.create(mockLspAuth as LanguageClientAuth);

//     beforeEach(function () {
//         sandbox = sinon.createSandbox()
//         backend = new AmazonQLoginWebview()
//     })

//     afterEach(function () {
//         sandbox.restore()
//     })

//     it('signs into builder ID and emits telemetry', async function () {
//         await backend.startBuilderIdSetup()

//         assert.ok(AuthUtil.instance.isConnected())
//         assert.ok(AuthUtil.instance.isBuilderIdConnection())

//         // TODO: @opieter implement telemetry
//         // assertTelemetry('auth_addConnection', {
//         //     result: 'Succeeded',
//         //     credentialSourceId: 'awsId',
//         //     authEnabledFeatures: 'codewhisperer',
//         //     isReAuth: false,
//         //     ssoRegistrationExpiresAt: mockRegistration.expiresAt.toISOString(),
//         //     ssoRegistrationClientId: mockRegistration.clientId,
//         // })
//     })

//     it('signs into IdC and emits telemetry', async function () {
//         await backend.startEnterpriseSetup(startUrl, region)

//         assert.ok(AuthUtil.instance.isConnected())
//         assert.ok(AuthUtil.instance.isIdcConnection())
//         assert.ok(AuthUtil.instance.isSsoSession())
//         assert.deepStrictEqual(AuthUtil.instance.connection?.startUrl, startUrl)
//         assert.deepStrictEqual(AuthUtil.instance.connection?.region, region)

//         // TODO: @opieter implement telemetry
//         // assertTelemetry('auth_addConnection', {
//         //     result: 'Succeeded',
//         //     credentialSourceId: 'iamIdentityCenter',
//         //     authEnabledFeatures: 'codewhisperer',
//         //     credentialStartUrl: startUrl,
//         //     awsRegion: region,
//         //     isReAuth: false,
//         //     ssoRegistrationExpiresAt: mockRegistration.expiresAt.toISOString(),
//         //     ssoRegistrationClientId: mockRegistration.clientId,
//         // })
//     })

//     it('reauths builder ID and emits telemetry', async function () {
//         AuthUtil.instance.logout()

//         // method under test
//         await backend.reauthenticateConnection()

//         assert.ok(AuthUtil.instance.isConnected())

//         // TODO: @opieter implement telemetry
//         // assertTelemetry('auth_addConnection', {
//         //     result: 'Succeeded',
//         //     credentialSourceId: 'awsId',
//         //     authEnabledFeatures: 'codewhisperer',
//         //     isReAuth: true,
//         //     ssoRegistrationExpiresAt: mockRegistration.expiresAt.toISOString(),
//         //     ssoRegistrationClientId: mockRegistration.clientId,
//         // })
//     })

//     it('reauths IdC and emits telemetry', async function () {
//         AuthUtil.instance.logout()

//         // method under test
//         await backend.reauthenticateConnection()

//         assert.ok(AuthUtil.instance.isConnected())

//         // TODO: @opieter implement telemetry
//         // assertTelemetry('auth_addConnection', {
//         //     result: 'Succeeded',
//         //     credentialSourceId: 'iamIdentityCenter',
//         //     authEnabledFeatures: 'codewhisperer',
//         //     credentialStartUrl: startUrl,
//         //     awsRegion: region,
//         //     isReAuth: true,
//         //     ssoRegistrationExpiresAt: mockRegistration.expiresAt.toISOString(),
//         //     ssoRegistrationClientId: mockRegistration.clientId,
//         // })
//     })

//     it('signs out of reauth and emits telemetry', async function () {
//         await backend.signout()

//         assert.ok(!AuthUtil.instance.isConnected())

//         // TODO: @opieter implement telemetry
//         // assertTelemetry('auth_addConnection', {
//         //     result: 'Cancelled',
//         //     credentialSourceId: 'iamIdentityCenter',
//         //     authEnabledFeatures: 'codewhisperer',
//         //     credentialStartUrl: startUrl,
//         //     awsRegion: region,
//         //     isReAuth: true,
//         //     ssoRegistrationExpiresAt: mockRegistration.expiresAt.toISOString(),
//         //     ssoRegistrationClientId: mockRegistration.clientId,
//         // })
//     })
// })
