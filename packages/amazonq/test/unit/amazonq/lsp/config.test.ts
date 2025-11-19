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
    let getStub: sinon.SinonStub
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
        getStub = sandbox.stub()
        sandbox.stub(DevSettings, 'instance').get(() => ({
            getServiceConfig: serviceConfigStub,
            get: getStub,
        }))
    })

    afterEach(() => {
        sandbox.restore()
        resetEnv()
    })

    it('uses default config', () => {
        serviceConfigStub.returns({})
        getStub.returns({})
        assert.deepStrictEqual(getAmazonQLspConfig(), { ...defaultAmazonQLspConfig, registryUrl: undefined })
    })

    it('overrides path', () => {
        const path = '/custom/path/to/lsp'
        serviceConfigStub.returns({ path })
        getStub.returns({})

        assert.deepStrictEqual(getAmazonQLspConfig(), {
            ...defaultAmazonQLspConfig,
            path,
            registryUrl: undefined,
        })
    })

    it('overrides default settings', () => {
        serviceConfigStub.returns(settingConfig)
        getStub.returns({})

        assert.deepStrictEqual(getAmazonQLspConfig(), { ...settingConfig, registryUrl: undefined })
    })

    it('environment variable takes precedence over settings', () => {
        setEnv(settingConfig)
        serviceConfigStub.returns({})
        getStub.returns({})
        assert.deepStrictEqual(getAmazonQLspConfig(), { ...settingConfig, registryUrl: undefined })
    })

    it('includes registryUrl from amazonqRegistry setting', () => {
        const registryUrl = 'https://custom.registry.url/manifest.json'
        serviceConfigStub.returns({})
        getStub.withArgs('amazonqRegistry', {}).returns({ registryUrl })

        assert.deepStrictEqual(getAmazonQLspConfig(), {
            ...defaultAmazonQLspConfig,
            registryUrl,
        })
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

describe('pushConfigUpdate', () => {
    let sandbox: sinon.SinonSandbox
    let mockClient: any
    let loggerStub: any
    let getLoggerStub: sinon.SinonStub
    let pushConfigUpdate: any

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        // Mock LanguageClient
        mockClient = {
            sendRequest: sandbox.stub().resolves(),
            sendNotification: sandbox.stub(),
        }

        // Create logger stub
        loggerStub = {
            debug: sandbox.stub(),
        }

        // Clear all relevant module caches
        const configModuleId = require.resolve('../../../../src/lsp/config')
        const sharedModuleId = require.resolve('aws-core-vscode/shared')
        delete require.cache[configModuleId]
        delete require.cache[sharedModuleId]

        // jscpd:ignore-start
        // Create getLogger stub and store reference for test verification
        getLoggerStub = sandbox.stub().returns(loggerStub)

        // Create a mock shared module with stubbed getLogger
        const mockSharedModule = {
            getLogger: getLoggerStub,
        }

        // Override the require cache with our mock
        require.cache[sharedModuleId] = {
            id: sharedModuleId,
            filename: sharedModuleId,
            loaded: true,
            parent: undefined,
            children: [],
            exports: mockSharedModule,
            paths: [],
        } as any

        // Now require the module - it should use our mocked getLogger
        // jscpd:ignore-end
        const configModule = require('../../../../src/lsp/config')
        pushConfigUpdate = configModule.pushConfigUpdate
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('should send profile configuration with logging', async () => {
        const config = {
            type: 'profile' as const,
            profileArn: 'test-profile-arn',
        }

        await pushConfigUpdate(mockClient, config)

        // Verify logging
        assert(loggerStub.debug.calledWith('Pushing profile configuration: test-profile-arn'))
        assert(loggerStub.debug.calledWith('Profile configuration pushed successfully'))

        // Verify client call
        assert(mockClient.sendRequest.calledOnce)
        assert(
            mockClient.sendRequest.calledWith(sinon.match.string, {
                section: 'aws.q',
                settings: { profileArn: 'test-profile-arn' },
            })
        )
    })

    it('should send customization configuration with logging', async () => {
        const config = {
            type: 'customization' as const,
            customization: 'test-customization-arn',
        }

        await pushConfigUpdate(mockClient, config)

        // Verify logging
        assert(loggerStub.debug.calledWith('Pushing customization configuration: test-customization-arn'))
        assert(loggerStub.debug.calledWith('Customization configuration pushed successfully'))

        // Verify client call
        assert(mockClient.sendNotification.calledOnce)
        assert(
            mockClient.sendNotification.calledWith(sinon.match.string, {
                section: 'aws.q',
                settings: { customization: 'test-customization-arn' },
            })
        )
    })

    it('should handle undefined profile ARN', async () => {
        const config = {
            type: 'profile' as const,
            profileArn: undefined,
        }

        await pushConfigUpdate(mockClient, config)

        // Verify logging with undefined
        assert(loggerStub.debug.calledWith('Pushing profile configuration: undefined'))
        assert(loggerStub.debug.calledWith('Profile configuration pushed successfully'))
    })

    it('should handle undefined customization ARN', async () => {
        const config = {
            type: 'customization' as const,
            customization: undefined,
        }

        await pushConfigUpdate(mockClient, config)

        // Verify logging with undefined
        assert(loggerStub.debug.calledWith('Pushing customization configuration: undefined'))
        assert(loggerStub.debug.calledWith('Customization configuration pushed successfully'))
    })

    it('should send logLevel configuration with logging', async () => {
        const config = {
            type: 'logLevel' as const,
        }

        await pushConfigUpdate(mockClient, config)

        // Verify logging
        assert(loggerStub.debug.calledWith('Pushing log level configuration'))
        assert(loggerStub.debug.calledWith('Log level configuration pushed successfully'))

        // Verify client call
        assert(mockClient.sendNotification.calledOnce)
        assert(
            mockClient.sendNotification.calledWith(sinon.match.string, {
                section: 'aws.logLevel',
            })
        )
    })
})
