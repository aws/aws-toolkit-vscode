/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { DevSettings } from 'aws-core-vscode/shared'
import sinon from 'sinon'
import { defaultAmazonQLspConfig, ExtendedAmazonQLSPConfig, getAmazonQLspConfig } from '../../../../src/lsp/config'

describe('getAmazonQLspConfig', () => {
    let sandbox: sinon.SinonSandbox
    let serviceConfigStub: sinon.SinonStub
    const settingConfig: ExtendedAmazonQLSPConfig = {
        manifestUrl: 'https://custom.url/manifest.json',
        supportedVersions: '4.0.0',
        id: 'AmazonQSetting',
        suppressPromptPrefix: getAmazonQLspConfig().suppressPromptPrefix,
        path: '/custom/path',
        ui: '/chat/client/location',
    }

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        serviceConfigStub = sandbox.stub()
        sandbox.stub(DevSettings, 'instance').get(() => ({
            getServiceConfig: serviceConfigStub,
        }))
    })

    afterEach(() => {
        sandbox.restore()
        resetEnv()
    })

    it('uses default config', () => {
        serviceConfigStub.returns({})
        assert.deepStrictEqual(getAmazonQLspConfig(), defaultAmazonQLspConfig)
    })

    it('overrides path', () => {
        const path = '/custom/path/to/lsp'
        serviceConfigStub.returns({ path })

        assert.deepStrictEqual(getAmazonQLspConfig(), {
            ...defaultAmazonQLspConfig,
            path,
        })
    })

    it('overrides default settings', () => {
        serviceConfigStub.returns(settingConfig)

        assert.deepStrictEqual(getAmazonQLspConfig(), settingConfig)
    })

    it('environment variable takes precedence over settings', () => {
        setEnv(settingConfig)
        serviceConfigStub.returns({})
        assert.deepStrictEqual(getAmazonQLspConfig(), settingConfig)
    })

    function setEnv(envConfig: ExtendedAmazonQLSPConfig) {
        process.env.__AMAZONQLSP_MANIFEST_URL = envConfig.manifestUrl
        process.env.__AMAZONQLSP_SUPPORTED_VERSIONS = envConfig.supportedVersions
        process.env.__AMAZONQLSP_ID = envConfig.id
        process.env.__AMAZONQLSP_PATH = envConfig.path
        process.env.__AMAZONQLSP_UI = envConfig.ui
    }

    function resetEnv() {
        delete process.env.__AMAZONQLSP_MANIFEST_URL
        delete process.env.__AMAZONQLSP_SUPPORTED_VERSIONS
        delete process.env.__AMAZONQLSP_ID
        delete process.env.__AMAZONQLSP_PATH
        delete process.env.__AMAZONQLSP_UI
    }
})
