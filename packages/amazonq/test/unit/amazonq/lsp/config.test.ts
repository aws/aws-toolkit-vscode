/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { DevSettings } from 'aws-core-vscode/shared'
import sinon from 'sinon'
import { defaultAmazonQLspConfig, ExtendedAmazonQLSPConfig, getAmazonQLspConfig } from '../../../../src/lsp/config'
import { defaultAmazonQWorkspaceLspConfig, getAmazonQWorkspaceLspConfig, LspConfig } from 'aws-core-vscode/amazonq'

for (const [name, config, defaultConfig, setEnv, resetEnv] of [
    [
        'getAmazonQLspConfig',
        getAmazonQLspConfig,
        defaultAmazonQLspConfig,
        (envConfig: ExtendedAmazonQLSPConfig) => {
            process.env.__AMAZONQLSP_MANIFEST_URL = envConfig.manifestUrl
            process.env.__AMAZONQLSP_SUPPORTED_VERSIONS = envConfig.supportedVersions
            process.env.__AMAZONQLSP_ID = envConfig.id
            process.env.__AMAZONQLSP_PATH = envConfig.path
            process.env.__AMAZONQLSP_UI = envConfig.ui
        },
        () => {
            delete process.env.__AMAZONQLSP_MANIFEST_URL
            delete process.env.__AMAZONQLSP_SUPPORTED_VERSIONS
            delete process.env.__AMAZONQLSP_ID
            delete process.env.__AMAZONQLSP_PATH
            delete process.env.__AMAZONQLSP_UI
        },
    ],
    [
        'getAmazonQWorkspaceLspConfig',
        getAmazonQWorkspaceLspConfig,
        defaultAmazonQWorkspaceLspConfig,
        (envConfig: LspConfig) => {
            process.env.__AMAZONQWORKSPACELSP_MANIFEST_URL = envConfig.manifestUrl
            process.env.__AMAZONQWORKSPACELSP_SUPPORTED_VERSIONS = envConfig.supportedVersions
            process.env.__AMAZONQWORKSPACELSP_ID = envConfig.id
            process.env.__AMAZONQWORKSPACELSP_PATH = envConfig.path
        },
        () => {
            delete process.env.__AMAZONQWORKSPACELSP_MANIFEST_URL
            delete process.env.__AMAZONQWORKSPACELSP_SUPPORTED_VERSIONS
            delete process.env.__AMAZONQWORKSPACELSP_ID
            delete process.env.__AMAZONQWORKSPACELSP_PATH
        },
    ],
] as const) {
    describe(name, () => {
        let sandbox: sinon.SinonSandbox
        let serviceConfigStub: sinon.SinonStub
        const settingConfig: LspConfig = {
            manifestUrl: 'https://custom.url/manifest.json',
            supportedVersions: '4.0.0',
            id: 'AmazonQSetting',
            suppressPromptPrefix: config().suppressPromptPrefix,
            path: '/custom/path',
            ...(name === 'getAmazonQLspConfig' && { ui: '/chat/client/location' }),
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
            assert.deepStrictEqual(config(), defaultConfig)
        })

        it('overrides path', () => {
            const path = '/custom/path/to/lsp'
            serviceConfigStub.returns({ path })

            assert.deepStrictEqual(config(), {
                ...defaultConfig,
                path,
            })
        })

        it('overrides default settings', () => {
            serviceConfigStub.returns(settingConfig)

            assert.deepStrictEqual(config(), settingConfig)
        })

        it('environment variable takes precedence over settings', () => {
            setEnv(settingConfig)
            serviceConfigStub.returns({})
            assert.deepStrictEqual(config(), settingConfig)
        })
    })
}
