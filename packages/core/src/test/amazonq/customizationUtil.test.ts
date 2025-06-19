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
    CustomizationProvider,
    FeatureConfigProvider,
    getSelectedCustomization,
    refreshStatusBar,
    RegionProfileManager,
    setSelectedCustomization,
} from '../../codewhisperer'
import { FeatureContext, globals } from '../../shared'
import { resetCodeWhispererGlobalVariables } from '../codewhisperer/testUtil'
import { createSsoProfile, createTestAuth } from '../credentials/testUtil'
import { createTestAuthUtil } from '../testAuthUtil'

const enterpriseSsoStartUrl = 'https://enterprise.awsapps.com/start'

describe('customizationProvider', function () {
    let regionProfileManager: RegionProfileManager

    beforeEach(async () => {
        createTestAuth(globals.globalState)
        await createTestAuthUtil()
        regionProfileManager = new RegionProfileManager(AuthUtil.instance)
    })

    afterEach(() => {
        sinon.restore()
    })

    it('init should create new instance with client', async function () {
        const mockAuthUtil = {
            regionProfileManager: regionProfileManager,
        }
        sinon.stub(AuthUtil, 'instance').get(() => mockAuthUtil)
        const createClientStub = sinon.stub(regionProfileManager, 'createQUserClient')
        const mockProfile = {
            name: 'foo',
            region: 'us-east-1',
            arn: 'arn',
            description: '',
        }

        const provider = await CustomizationProvider.init(mockProfile)
        assert(provider instanceof CustomizationProvider)
        assert(createClientStub.calledOnce)
        assert(createClientStub.calledWith(mockProfile))
        assert.strictEqual(provider.region, 'us-east-1')
    })
})

describe('CodeWhisperer-customizationUtils', function () {
    let auth: ReturnType<typeof createTestAuth>
    let featureCustomization: FeatureContext

    before(async function () {
        createTestAuth(globals.globalState)
        tryRegister(refreshStatusBar)
    })

    beforeEach(async function () {
        await createTestAuthUtil()

        auth = createTestAuth(globals.globalState)
        await auth.createInvalidSsoConnection(
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

        await resetCodeWhispererGlobalVariables()
    })

    afterEach(function () {
        sinon.restore()
    })

    it('Returns baseCustomization when not SSO', async function () {
        sinon.stub(AuthUtil.instance, 'isIdcConnection').returns(false)

        const customization = getSelectedCustomization()

        assert.strictEqual(customization.name, baseCustomization.name)
    })

    it('Returns selectedCustomization when customization manually selected', async function () {
        sinon.stub(AuthUtil.instance, 'isIdcConnection').returns(true)

        const selectedCustomization: Customization = {
            arn: 'selectedCustomizationArn',
            name: 'selectedCustomizationName',
            description: 'selectedCustomizationDescription',
        }

        await setSelectedCustomization(selectedCustomization)

        const actualCustomization = getSelectedCustomization()

        assert.strictEqual(actualCustomization.name, selectedCustomization.name)
    })

    it(`setSelectedCustomization should set to the customization provided if override option is false or not specified`, async function () {
        sinon.stub(AuthUtil.instance, 'isIdcConnection').returns(true)

        await setSelectedCustomization({ arn: 'FOO' }, false)
        assert.strictEqual(getSelectedCustomization().arn, 'FOO')

        await setSelectedCustomization({ arn: 'BAR' })
        assert.strictEqual(getSelectedCustomization().arn, 'BAR')

        await setSelectedCustomization({ arn: 'BAZ' })
        assert.strictEqual(getSelectedCustomization().arn, 'BAZ')

        await setSelectedCustomization({ arn: 'QOO' }, false)
        assert.strictEqual(getSelectedCustomization().arn, 'QOO')
    })

    it(`setSelectedCustomization should only set to the customization provided once for override per customization arn if override is true`, async function () {
        sinon.stub(AuthUtil.instance, 'isIdcConnection').returns(true)

        await setSelectedCustomization({ arn: 'OVERRIDE' }, true)
        assert.strictEqual(getSelectedCustomization().arn, 'OVERRIDE')

        await setSelectedCustomization({ arn: 'FOO' }, false)
        assert.strictEqual(getSelectedCustomization().arn, 'FOO')

        // Should NOT override only happen per customization arn
        await setSelectedCustomization({ arn: 'OVERRIDE' }, true)
        assert.strictEqual(getSelectedCustomization().arn, 'FOO')

        await setSelectedCustomization({ arn: 'FOO' }, false)
        assert.strictEqual(getSelectedCustomization().arn, 'FOO')

        await setSelectedCustomization({ arn: 'BAR' }, false)
        assert.strictEqual(getSelectedCustomization().arn, 'BAR')

        // Sould override as it's a different arn
        await setSelectedCustomization({ arn: 'OVERRIDE_V2' }, true)
        assert.strictEqual(getSelectedCustomization().arn, 'OVERRIDE_V2')
    })
})
