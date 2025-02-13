/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { DevSettings } from 'aws-core-vscode/shared'
import sinon from 'sinon'
import { defaultAmazonQLspConfig, getAmazonQLspConfig } from '../../../../src/lsp/config'

describe('getAmazonQLspConfig', () => {
    let sandbox: sinon.SinonSandbox
    let serviceConfigStub: sinon.SinonStub
    const settingConfig = {
        manifestUrl: 'https://custom.url/manifest.json',
        supportedVersions: '4.0.0',
        id: 'AmazonQSetting',
        locationOverride: '/custom/path',
    }

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        serviceConfigStub = sandbox.stub()

        // Create the DevSettings mock with the properly typed stub
        sandbox.stub(DevSettings, 'instance').get(() => ({
            getServiceConfig: serviceConfigStub,
        }))
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('uses default config when no overrides are present', () => {
        serviceConfigStub.returns({})
        const config = getAmazonQLspConfig()
        assert.deepStrictEqual(config, defaultAmazonQLspConfig)
    })

    it('overrides location', () => {
        const locationOverride = '/custom/path/to/lsp'
        serviceConfigStub.returns({ locationOverride })

        const config = getAmazonQLspConfig()
        assert.deepStrictEqual(config, {
            ...defaultAmazonQLspConfig,
            locationOverride,
        })
    })

    it('override default settings', () => {
        serviceConfigStub.returns(settingConfig)

        const config = getAmazonQLspConfig()
        assert.deepStrictEqual(config, settingConfig)
    })

    it('environment variable takes precedence over settings', () => {
        const envConfig = {
            manifestUrl: 'https://another-custom.url/manifest.json',
            supportedVersions: '5.1.1',
            id: 'AmazonQEnv',
            locationOverride: '/some/new/custom/path',
        }

        process.env.__AMAZONQLSP_MANIFEST_URL = envConfig.manifestUrl
        process.env.__AMAZONQLSP_SUPPORTED_VERSIONS = envConfig.supportedVersions
        process.env.__AMAZONQLSP_ID = envConfig.id
        process.env.__AMAZONQLSP_LOCATION_OVERRIDE = envConfig.locationOverride

        serviceConfigStub.returns(settingConfig)

        const config = getAmazonQLspConfig()
        assert.deepStrictEqual(config, {
            ...defaultAmazonQLspConfig,
            ...envConfig,
        })
    })
})
