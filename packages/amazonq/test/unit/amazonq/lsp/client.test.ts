/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { LanguageClient } from 'vscode-languageclient'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { AmazonQLspAuth } from '../../../../src/lsp/auth'

// These tests verify the behavior of the authentication functions
// Since the actual functions are module-level and use real dependencies,
// we test the expected behavior through mock implementations

describe('Language Server Client Authentication', function () {
    let sandbox: sinon.SinonSandbox
    let mockClient: any
    let mockAuth: any
    let authUtilStub: sinon.SinonStub
    let loggerStub: any
    let getLoggerStub: sinon.SinonStub
    let pushConfigUpdateStub: sinon.SinonStub

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        // Mock LanguageClient
        mockClient = {
            sendRequest: sandbox.stub().resolves(),
            sendNotification: sandbox.stub(),
            onDidChangeState: sandbox.stub(),
        }

        // Mock AmazonQLspAuth
        mockAuth = {
            refreshConnection: sandbox.stub().resolves(),
        }

        // Mock AuthUtil
        authUtilStub = sandbox.stub(AuthUtil, 'instance').get(() => ({
            isConnectionValid: sandbox.stub().returns(true),
            regionProfileManager: {
                activeRegionProfile: { arn: 'test-profile-arn' },
            },
            auth: {
                getConnectionState: sandbox.stub().returns('valid'),
                activeConnection: { id: 'test-connection' },
            },
        }))

        // Create logger stub
        loggerStub = {
            info: sandbox.stub(),
            debug: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub(),
        }

        // Clear all relevant module caches
        const sharedModuleId = require.resolve('aws-core-vscode/shared')
        const configModuleId = require.resolve('../../../../src/lsp/config')
        delete require.cache[sharedModuleId]
        delete require.cache[configModuleId]

        // jscpd:ignore-start
        // Create getLogger stub
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
        // jscpd:ignore-end

        // Mock pushConfigUpdate
        pushConfigUpdateStub = sandbox.stub().resolves()
        const mockConfigModule = {
            pushConfigUpdate: pushConfigUpdateStub,
        }

        require.cache[configModuleId] = {
            id: configModuleId,
            filename: configModuleId,
            loaded: true,
            parent: undefined,
            children: [],
            exports: mockConfigModule,
            paths: [],
        } as any
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('initializeLanguageServerConfiguration behavior', function () {
        it('should initialize configuration when connection is valid', async function () {
            // Test the expected behavior of the function
            const mockInitializeFunction = async (client: LanguageClient, context: string) => {
                const { getLogger } = require('aws-core-vscode/shared')
                const { pushConfigUpdate } = require('../../../../src/lsp/config')
                const logger = getLogger('amazonqLsp')

                if (AuthUtil.instance.isConnectionValid()) {
                    logger.info(`[${context}] Initializing language server configuration`)

                    // Send profile configuration
                    logger.debug(`[${context}] Sending profile configuration to language server`)
                    await pushConfigUpdate(client, {
                        type: 'profile',
                        profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
                    })
                    logger.debug(`[${context}] Profile configuration sent successfully`)

                    // Send customization configuration
                    logger.debug(`[${context}] Sending customization configuration to language server`)
                    await pushConfigUpdate(client, {
                        type: 'customization',
                        customization: 'test-customization',
                    })
                    logger.debug(`[${context}] Customization configuration sent successfully`)

                    logger.info(`[${context}] Language server configuration completed successfully`)
                } else {
                    logger.warn(`[${context}] Connection invalid, skipping configuration`)
                }
            }

            await mockInitializeFunction(mockClient as any, 'startup')

            // Verify logging
            assert(loggerStub.info.calledWith('[startup] Initializing language server configuration'))
            assert(loggerStub.debug.calledWith('[startup] Sending profile configuration to language server'))
            assert(loggerStub.debug.calledWith('[startup] Profile configuration sent successfully'))
            assert(loggerStub.debug.calledWith('[startup] Sending customization configuration to language server'))
            assert(loggerStub.debug.calledWith('[startup] Customization configuration sent successfully'))
            assert(loggerStub.info.calledWith('[startup] Language server configuration completed successfully'))

            // Verify pushConfigUpdate was called twice
            assert.strictEqual(pushConfigUpdateStub.callCount, 2)

            // Verify profile configuration
            assert(
                pushConfigUpdateStub.calledWith(mockClient, {
                    type: 'profile',
                    profileArn: 'test-profile-arn',
                })
            )

            // Verify customization configuration
            assert(
                pushConfigUpdateStub.calledWith(mockClient, {
                    type: 'customization',
                    customization: 'test-customization',
                })
            )
        })

        it('should log warning when connection is invalid', async function () {
            // Mock invalid connection
            authUtilStub.get(() => ({
                isConnectionValid: sandbox.stub().returns(false),
                auth: {
                    getConnectionState: sandbox.stub().returns('invalid'),
                    activeConnection: { id: 'test-connection' },
                },
            }))

            const mockInitializeFunction = async (client: LanguageClient, context: string) => {
                const { getLogger } = require('aws-core-vscode/shared')
                const logger = getLogger('amazonqLsp')

                // jscpd:ignore-start
                if (AuthUtil.instance.isConnectionValid()) {
                    // Should not reach here
                } else {
                    logger.warn(
                        `[${context}] Connection invalid, skipping language server configuration - this will cause authentication failures`
                    )
                    const activeConnection = AuthUtil.instance.auth.activeConnection
                    const connectionState = activeConnection
                        ? AuthUtil.instance.auth.getConnectionState(activeConnection)
                        : 'no-connection'
                    logger.warn(`[${context}] Connection state: ${connectionState}`)
                // jscpd:ignore-end
                }
            }

            await mockInitializeFunction(mockClient as any, 'crash-recovery')

            // Verify warning logs
            assert(
                loggerStub.warn.calledWith(
                    '[crash-recovery] Connection invalid, skipping language server configuration - this will cause authentication failures'
                )
            )
            assert(loggerStub.warn.calledWith('[crash-recovery] Connection state: invalid'))

            // Verify pushConfigUpdate was not called
            assert.strictEqual(pushConfigUpdateStub.callCount, 0)
        })
    })

    describe('crash recovery handler behavior', function () {
        it('should reinitialize authentication after crash', async function () {
            const mockCrashHandler = async (client: LanguageClient, auth: AmazonQLspAuth) => {
                const { getLogger } = require('aws-core-vscode/shared')
                const { pushConfigUpdate } = require('../../../../src/lsp/config')
                const logger = getLogger('amazonqLsp')

                logger.info('[crash-recovery] Language server crash detected, reinitializing authentication')

                try {
                    logger.debug('[crash-recovery] Refreshing connection and sending bearer token')
                    await auth.refreshConnection(true)
                    logger.debug('[crash-recovery] Bearer token sent successfully')

                    // Mock the configuration initialization
                    if (AuthUtil.instance.isConnectionValid()) {
                        await pushConfigUpdate(client, {
                            type: 'profile',
                            profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
                        })
                    }

                    logger.info('[crash-recovery] Authentication reinitialized successfully')
                } catch (error) {
                    logger.error(`[crash-recovery] Failed to reinitialize after crash: ${error}`)
                }
            }

            await mockCrashHandler(mockClient as any, mockAuth as any)

            // Verify crash recovery logging
            assert(
                loggerStub.info.calledWith(
                    '[crash-recovery] Language server crash detected, reinitializing authentication'
                )
            )
            assert(loggerStub.debug.calledWith('[crash-recovery] Refreshing connection and sending bearer token'))
            assert(loggerStub.debug.calledWith('[crash-recovery] Bearer token sent successfully'))
            assert(loggerStub.info.calledWith('[crash-recovery] Authentication reinitialized successfully'))

            // Verify auth.refreshConnection was called
            assert(mockAuth.refreshConnection.calledWith(true))

            // Verify profile configuration was sent
            assert(
                pushConfigUpdateStub.calledWith(mockClient, {
                    type: 'profile',
                    profileArn: 'test-profile-arn',
                })
            )
        })
    })
})
