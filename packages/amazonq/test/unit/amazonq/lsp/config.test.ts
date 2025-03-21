/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { DevSettings } from 'aws-core-vscode/shared'
import sinon from 'sinon'
import { defaultAmazonQLspConfig, getAmazonQLspConfig } from '../../../../src/lsp/config'
import { LspConfig, getAmazonQWorkspaceLspConfig, defaultAmazonQWorkspaceLspConfig } from 'aws-core-vscode/amazonq'

for (const [name, config, defaultConfig, setEnv, resetEnv] of [
    [
        'getAmazonQLspConfig',
        getAmazonQLspConfig,
        defaultAmazonQLspConfig,
        (envConfig: LspConfig) => {
            process.env.__AMAZONQLSP_MANIFEST_URL = envConfig.manifestUrl
            process.env.__AMAZONQLSP_SUPPORTED_VERSIONS = envConfig.supportedVersions
            process.env.__AMAZONQLSP_ID = envConfig.id
            process.env.__AMAZONQLSP_PATH = envConfig.path
        },
        () => {
            delete process.env.__AMAZONQLSP_MANIFEST_URL
            delete process.env.__AMAZONQLSP_SUPPORTED_VERSIONS
            delete process.env.__AMAZONQLSP_ID
            delete process.env.__AMAZONQLSP_PATH
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
            suppressPromptPrefix: 'amazonQSetting',
            path: '/custom/path',
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

        it('overrides location', () => {
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
            const envConfig: LspConfig = {
                manifestUrl: 'https://another-custom.url/manifest.json',
                supportedVersions: '5.1.1',
                id: 'AmazonQEnv',
                suppressPromptPrefix: 'amazonQEnv',
                path: '/some/new/custom/path',
            }

            setEnv(envConfig)
            serviceConfigStub.returns(settingConfig)

            assert.deepStrictEqual(config(), {
                ...defaultAmazonQLspConfig,
                ...envConfig,
            })
        })
    })
}
