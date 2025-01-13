/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import { tryRegister } from '../testUtil'
import {
    amazonQScopes,
    AuthUtil,
    baseCustomization,
    Customization,
    FeatureConfigProvider,
    getSelectedCustomization,
    refreshStatusBar,
    setSelectedCustomization,
} from '../../codewhisperer'
import { FeatureContext, globals } from '../../shared'
import { resetCodeWhispererGlobalVariables } from '../codewhisperer/testUtil'
import { createSsoProfile, createTestAuth } from '../credentials/testUtil'
import { SsoConnection } from '../../auth'

const enterpriseSsoStartUrl = 'https://enterprise.awsapps.com/start'

describe('CodeWhisperer-customizationUtils', function () {
    let auth: ReturnType<typeof createTestAuth>
    let ssoConn: SsoConnection
    let featureCustomization: FeatureContext

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

    it('Returns baseCustomization when not SSO', async function () {
        sinon.stub(AuthUtil.instance, 'isValidEnterpriseSsoInUse').returns(false)
        const customization = getSelectedCustomization()

        assert.strictEqual(customization.name, baseCustomization.name)
    })

    it('Returns selectedCustomization when customization manually selected', async function () {
        sinon.stub(AuthUtil.instance, 'isValidEnterpriseSsoInUse').returns(true)

        const selectedCustomization: Customization = {
            arn: 'selectedCustomizationArn',
            name: 'selectedCustomizationName',
            description: 'selectedCustomizationDescription',
        }

        await setSelectedCustomization(selectedCustomization)

        const actualCustomization = getSelectedCustomization()

        assert.strictEqual(actualCustomization.name, selectedCustomization.name)
    })

    it('Returns AB customization', async function () {
        sinon.stub(AuthUtil.instance, 'isValidEnterpriseSsoInUse').returns(true)

        await setSelectedCustomization(baseCustomization)

        const returnedCustomization = getSelectedCustomization()

        assert.strictEqual(returnedCustomization.name, featureCustomization.name)
    })
})
