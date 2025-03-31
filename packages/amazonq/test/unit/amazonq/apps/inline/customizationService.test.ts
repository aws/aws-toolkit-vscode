/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import { LanguageClient } from 'vscode-languageclient'
import { createSsoProfile, createTestAuth, resetCodeWhispererGlobalVariables, tryRegister } from 'aws-core-vscode/test'
import { SsoConnection } from 'aws-core-vscode/auth'
import { FeatureContext, globals } from 'aws-core-vscode/shared'
import { CustomizationService } from '../../../../../src/app/inline/customizationService'
import {
    amazonQScopes,
    AuthUtil,
    baseCustomization,
    Customization,
    FeatureConfigProvider,
    refreshStatusBar,
} from 'aws-core-vscode/codewhisperer'
import { getConfigurationFromServerRequestType } from '@aws/language-server-runtimes/protocol'

const enterpriseSsoStartUrl = 'https://enterprise.awsapps.com/start'

describe('CustomizationService', function () {
    let auth: ReturnType<typeof createTestAuth>
    let ssoConn: SsoConnection
    let featureCustomization: FeatureContext
    let customizationService: CustomizationService
    let languageClient: LanguageClient
    let sendRequestStub: sinon.SinonStub
    let sendNotificationStub: sinon.SinonStub
    const mockCustomization = {
        arn: 'customizationArn',
        name: 'customizationName',
        description: 'customizationDescription',
    }

    before(async function () {
        createTestAuth(globals.globalState)
        tryRegister(refreshStatusBar)
    })

    beforeEach(async function () {
        auth = createTestAuth(globals.globalState)
        ssoConn = await auth.createInvalidSsoConnection(
            createSsoProfile({ startUrl: enterpriseSsoStartUrl, scopes: amazonQScopes })
        )
        featureCustomization = {
            name: 'featureCustomizationName',
            value: {
                stringValue: 'featureCustomizationArn',
            },
            variation: 'featureCustomizationName',
        }
        sendRequestStub = sinon.stub()
        sendNotificationStub = sinon.stub()
        languageClient = {
            sendRequest: sendRequestStub,
            sendNotification: sendNotificationStub,
        } as unknown as LanguageClient
        customizationService = new CustomizationService(languageClient)
        sinon.stub(FeatureConfigProvider, 'getFeature').returns(featureCustomization)

        sinon.stub(AuthUtil.instance, 'isConnectionExpired').returns(false)
        sinon.stub(AuthUtil.instance, 'isConnected').returns(true)
        sinon.stub(AuthUtil.instance, 'isCustomizationFeatureEnabled').value(true)
        sinon.stub(AuthUtil.instance, 'conn').value(ssoConn)

        await resetCodeWhispererGlobalVariables()
    })

    afterEach(function () {
        sinon.restore()
    })

    it('Gets customizations from language server', async function () {
        const customizations: Customization[] = [mockCustomization]
        sendRequestStub.resolves({ customizations })

        const actualCustomizations = await customizationService.getCustomizationsFromLsp()

        assert(
            sendRequestStub.calledOnceWithExactly(getConfigurationFromServerRequestType.method, { section: 'aws.q' })
        )
        assert.deepStrictEqual(actualCustomizations, customizations)
    })

    it('Sends notification to language server when a customization is selected', async function () {
        const customization: Customization = mockCustomization

        await customizationService.setSelectedCustomization(customization)

        assert(
            sendNotificationStub.calledOnceWithExactly('workspace/didChangeConfiguration', {
                section: 'amazonQ',
                settings: {
                    customization: mockCustomization.arn,
                },
            })
        )
    })

    it('Returns baseCustomization when not SSO', async function () {
        sinon.stub(AuthUtil.instance, 'isValidEnterpriseSsoInUse').returns(false)
        const customization = customizationService.getSelectedCustomization()

        assert.strictEqual(customization.name, baseCustomization.name)
    })

    it('Returns selectedCustomization when customization manually selected', async function () {
        sinon.stub(AuthUtil.instance, 'isValidEnterpriseSsoInUse').returns(true)

        const selectedCustomization: Customization = {
            arn: 'selectedCustomizationArn',
            name: 'selectedCustomizationName',
            description: 'selectedCustomizationDescription',
        }

        await customizationService.setSelectedCustomization(selectedCustomization)

        const actualCustomization = customizationService.getSelectedCustomization()

        assert.strictEqual(actualCustomization.name, selectedCustomization.name)
    })

    it(`setSelectedCustomization should set to the customization provided if override option is false or not specified`, async function () {
        await customizationService.setSelectedCustomization({ arn: 'FOO' }, false)
        assert.strictEqual(customizationService.getSelectedCustomization().arn, 'FOO')

        await customizationService.setSelectedCustomization({ arn: 'BAR' })
        assert.strictEqual(customizationService.getSelectedCustomization().arn, 'BAR')

        await customizationService.setSelectedCustomization({ arn: 'BAZ' })
        assert.strictEqual(customizationService.getSelectedCustomization().arn, 'BAZ')

        await customizationService.setSelectedCustomization({ arn: 'QOO' }, false)
        assert.strictEqual(customizationService.getSelectedCustomization().arn, 'QOO')
    })

    it(`setSelectedCustomization should only set to the customization provided once for override per customization arn if override is true`, async function () {
        await customizationService.setSelectedCustomization({ arn: 'OVERRIDE' }, true)
        assert.strictEqual(customizationService.getSelectedCustomization().arn, 'OVERRIDE')

        await customizationService.setSelectedCustomization({ arn: 'FOO' }, false)
        assert.strictEqual(customizationService.getSelectedCustomization().arn, 'FOO')

        // Should NOT override only happen per customization arn
        await customizationService.setSelectedCustomization({ arn: 'OVERRIDE' }, true)
        assert.strictEqual(customizationService.getSelectedCustomization().arn, 'FOO')

        await customizationService.setSelectedCustomization({ arn: 'FOO' }, false)
        assert.strictEqual(customizationService.getSelectedCustomization().arn, 'FOO')

        await customizationService.setSelectedCustomization({ arn: 'BAR' }, false)
        assert.strictEqual(customizationService.getSelectedCustomization().arn, 'BAR')

        // Sould override as it's a different arn
        await customizationService.setSelectedCustomization({ arn: 'OVERRIDE_V2' }, true)
        assert.strictEqual(customizationService.getSelectedCustomization().arn, 'OVERRIDE_V2')
    })
})
