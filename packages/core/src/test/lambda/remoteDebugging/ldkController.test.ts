/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import sinon, { SinonStubbedInstance, createStubInstance } from 'sinon'
import { Lambda } from 'aws-sdk'
import {
    RemoteDebugController,
    DebugConfig,
    activateRemoteDebugging,
    revertExistingConfig,
    getLambdaSnapshot,
} from '../../../lambda/remoteDebugging/ldkController'
import { LdkClient } from '../../../lambda/remoteDebugging/ldkClient'
import globals from '../../../shared/extensionGlobals'
import * as messages from '../../../shared/utilities/messages'
import { getOpenExternalStub } from '../../globalSetup.test'
import { assertTelemetry } from '../../testUtil'
import {
    createMockFunctionConfig,
    createMockDebugConfig,
    createMockGlobalState,
    setupMockLdkClientOperations,
    setupMockVSCodeDebugAPIs,
    setupMockRevertExistingConfig,
} from './testUtils'

describe('RemoteDebugController', () => {
    let sandbox: sinon.SinonSandbox
    let mockLdkClient: SinonStubbedInstance<LdkClient>
    let controller: RemoteDebugController
    let mockGlobalState: any

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        // Mock LdkClient
        mockLdkClient = createStubInstance(LdkClient)
        sandbox.stub(LdkClient, 'instance').get(() => mockLdkClient)

        // Mock global state with actual storage
        mockGlobalState = createMockGlobalState()
        sandbox.stub(globals, 'globalState').value(mockGlobalState)

        // Get controller instance
        controller = RemoteDebugController.instance

        // Ensure clean state
        controller.ensureCleanState()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('Singleton Pattern', () => {
        it('should return the same instance', () => {
            const instance1 = RemoteDebugController.instance
            const instance2 = RemoteDebugController.instance
            assert.strictEqual(instance1, instance2, 'Should return the same singleton instance')
        })
    })

    describe('State Management', () => {
        it('should initialize with clean state', () => {
            controller.ensureCleanState()

            assert.strictEqual(controller.isDebugging, false, 'Should not be debugging initially')
            assert.strictEqual(controller.qualifier, undefined, 'Qualifier should be undefined initially')
        })

        it('should clean up disposables on ensureCleanState', () => {
            // Set up some mock disposables
            const mockDisposable = { dispose: sandbox.stub() }
            ;(controller as any).debugSessionDisposables.set('test-arn', mockDisposable)

            controller.ensureCleanState()

            assert(mockDisposable.dispose.calledOnce, 'Should dispose existing disposables')
            assert.strictEqual((controller as any).debugSessionDisposables.size, 0, 'Should clear disposables map')
        })
    })

    describe('Runtime Support Checks', () => {
        it('should support code download for node and python runtimes', () => {
            assert.strictEqual(controller.supportCodeDownload('nodejs18.x'), true, 'Should support Node.js')
            assert.strictEqual(controller.supportCodeDownload('python3.9'), true, 'Should support Python')
            assert.strictEqual(
                controller.supportCodeDownload('java11'),
                false,
                'Should not support Java for code download'
            )
            assert.strictEqual(controller.supportCodeDownload(undefined), false, 'Should not support undefined runtime')
        })

        it('should support remote debug for node, python, and java runtimes', () => {
            assert.strictEqual(controller.supportRuntimeRemoteDebug('nodejs18.x'), true, 'Should support Node.js')
            assert.strictEqual(controller.supportRuntimeRemoteDebug('python3.9'), true, 'Should support Python')
            assert.strictEqual(controller.supportRuntimeRemoteDebug('java11'), true, 'Should support Java')
            assert.strictEqual(controller.supportRuntimeRemoteDebug('dotnet6'), false, 'Should not support .NET')
            assert.strictEqual(
                controller.supportRuntimeRemoteDebug(undefined),
                false,
                'Should not support undefined runtime'
            )
        })

        it('should get remote debug layer for supported regions and architectures', () => {
            const result = controller.getRemoteDebugLayer('us-east-1', ['x86_64'])

            assert.strictEqual(typeof result, 'string', 'Should return layer ARN for supported region and architecture')
            assert(result?.includes('us-east-1'), 'Should contain the region in the ARN')
            assert(result?.includes('LDKLayerX86'), 'Should contain the x86 layer name')
        })

        it('should return undefined for unsupported regions', () => {
            const result = controller.getRemoteDebugLayer('unsupported-region', ['x86_64'])

            assert.strictEqual(result, undefined, 'Should return undefined for unsupported region')
        })

        it('should return undefined when region or architectures are undefined', () => {
            assert.strictEqual(controller.getRemoteDebugLayer(undefined, ['x86_64']), undefined)
            assert.strictEqual(controller.getRemoteDebugLayer('us-west-2', undefined), undefined)
        })
    })

    describe('Extension Installation', () => {
        it('should return true when extension is already installed', async () => {
            // Mock VSCode extensions API - return extension as already installed
            const mockExtension = { id: 'ms-vscode.js-debug', isActive: true }
            sandbox.stub(vscode.extensions, 'getExtension').returns(mockExtension as any)

            const result = await controller.installDebugExtension('nodejs18.x')

            assert.strictEqual(result, true, 'Should return true when extension is already installed')
        })

        it('should return true when extension installation succeeds', async () => {
            // Mock extension as not installed initially, then installed after command
            const getExtensionStub = sandbox.stub(vscode.extensions, 'getExtension')
            getExtensionStub.onFirstCall().returns(undefined) // Not installed initially
            getExtensionStub.onSecondCall().returns({ isActive: true } as any) // Installed after command

            sandbox.stub(vscode.commands, 'executeCommand').resolves()
            sandbox.stub(messages, 'showConfirmationMessage').resolves(true)

            const result = await controller.installDebugExtension('python3.9')

            assert.strictEqual(result, true, 'Should return true when installation succeeds')
        })

        it('should return false when user cancels extension installation', async () => {
            // Mock extension as not installed
            sandbox.stub(vscode.extensions, 'getExtension').returns(undefined)
            sandbox.stub(messages, 'showConfirmationMessage').resolves(false)

            const result = await controller.installDebugExtension('python3.9')

            assert.strictEqual(result, false, 'Should return false when user cancels')
        })

        it('should handle Java runtime workflow', async () => {
            // Mock extension as already installed to skip extension installation
            const mockExtension = { id: 'redhat.java', isActive: true }
            sandbox.stub(vscode.extensions, 'getExtension').returns(mockExtension as any)

            // Mock no Java path found
            sandbox.stub(require('../../../shared/utilities/pathFind'), 'findJavaPath').resolves(undefined)

            // Mock user choosing to install JVM
            const showConfirmationStub = sandbox.stub(messages, 'showConfirmationMessage').resolves(true)

            // Mock openExternal to prevent actual URL opening
            // sandbox.stub(vscode.env, 'openExternal').resolves(true)
            getOpenExternalStub().resolves(true)
            const result = await controller.installDebugExtension('java11')

            assert.strictEqual(result, false, 'Should return false to allow user to install JVM')
            assert(showConfirmationStub.calledOnce, 'Should show JVM installation dialog')
        })

        it('should throw error for undefined runtime', async () => {
            await assert.rejects(
                async () => await controller.installDebugExtension(undefined),
                /Runtime is undefined/,
                'Should throw error for undefined runtime'
            )
        })
    })

    describe('Debug Session Management', () => {
        let mockConfig: DebugConfig
        let mockFunctionConfig: Lambda.FunctionConfiguration

        beforeEach(() => {
            mockConfig = createMockDebugConfig({
                layerArn: 'arn:aws:lambda:us-west-2:123456789012:layer:LDKLayerX86:6',
            })

            mockFunctionConfig = createMockFunctionConfig()
        })

        it('should start debugging successfully', async () => {
            // Mock VSCode APIs
            setupMockVSCodeDebugAPIs(sandbox)

            // Mock runtime support
            sandbox.stub(controller, 'supportRuntimeRemoteDebug').returns(true)

            // Mock successful LdkClient operations
            setupMockLdkClientOperations(mockLdkClient, mockFunctionConfig)

            // Mock revertExistingConfig
            setupMockRevertExistingConfig(sandbox)

            await controller.startDebugging(mockConfig.functionArn, 'nodejs18.x', mockConfig)

            // Assert state changes
            assert.strictEqual(controller.isDebugging, true, 'Should be in debugging state')
            // Qualifier is only set for version publishing, not for $LATEST
            assert.strictEqual(controller.qualifier, undefined, 'Should not set qualifier for $LATEST')

            // Verify LdkClient calls
            assert(mockLdkClient.getFunctionDetail.calledWith(mockConfig.functionArn), 'Should get function details')
            assert(mockLdkClient.createOrReuseTunnel.calledOnce, 'Should create tunnel')
            assert(mockLdkClient.createDebugDeployment.calledOnce, 'Should create debug deployment')
            assert(mockLdkClient.startProxy.calledOnce, 'Should start proxy')
        })

        it('should handle debugging start failure and cleanup', async () => {
            // Mock VSCode APIs
            setupMockVSCodeDebugAPIs(sandbox)

            // Mock runtime support
            sandbox.stub(controller, 'supportRuntimeRemoteDebug').returns(true)

            // Mock function config retrieval success but tunnel creation failure
            setupMockLdkClientOperations(mockLdkClient, mockFunctionConfig)
            mockLdkClient.createOrReuseTunnel.rejects(new Error('Tunnel creation failed'))

            // Mock revertExistingConfig
            setupMockRevertExistingConfig(sandbox)

            let errorThrown = false
            try {
                await controller.startDebugging(mockConfig.functionArn, 'nodejs18.x', mockConfig)
            } catch (error) {
                errorThrown = true
                assert(error instanceof Error, 'Should throw an error')
                assert(
                    error.message.includes('Error StartDebugging') || error.message.includes('Tunnel creation failed'),
                    'Should throw relevant error'
                )
            }

            assert(errorThrown, 'Should have thrown an error')

            // Assert state is cleaned up
            assert.strictEqual(controller.isDebugging, false, 'Should not be in debugging state after failure')
            assert(mockLdkClient.stopProxy.calledOnce, 'Should attempt cleanup')
        })

        it('should handle version publishing workflow', async () => {
            // Mock VSCode APIs
            setupMockVSCodeDebugAPIs(sandbox)

            // Mock runtime support
            sandbox.stub(controller, 'supportRuntimeRemoteDebug').returns(true)

            const versionConfig = { ...mockConfig, shouldPublishVersion: true }

            // Mock successful LdkClient operations with version publishing
            setupMockLdkClientOperations(mockLdkClient, mockFunctionConfig)
            mockLdkClient.createDebugDeployment.resolves('v1')

            // Mock revertExistingConfig
            setupMockRevertExistingConfig(sandbox)

            await controller.startDebugging(versionConfig.functionArn, 'nodejs18.x', versionConfig)

            assert.strictEqual(controller.isDebugging, true, 'Should be in debugging state')
            assert.strictEqual(controller.qualifier, 'v1', 'Should set version qualifier')
        })

        it('should prevent multiple debugging sessions', async () => {
            // Set controller to already debugging
            controller.isDebugging = true

            await controller.startDebugging(mockConfig.functionArn, 'nodejs18.x', mockConfig)

            // Should not call LdkClient methods
            assert(mockLdkClient.getFunctionDetail.notCalled, 'Should not start new session')
        })
    })

    describe('Stop Debugging', () => {
        it('should stop debugging successfully', async () => {
            // Mock VSCode APIs
            sandbox.stub(vscode.commands, 'executeCommand').resolves()

            // Set up debugging state
            controller.isDebugging = true
            controller.qualifier = 'v1'

            const mockFunctionConfig = {
                FunctionName: 'testFunction',
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
            }
            // Set up the snapshot in mock state
            await mockGlobalState.update('aws.lambda.remoteDebugSnapshot', mockFunctionConfig)

            // Mock successful cleanup operations
            mockLdkClient.stopProxy.resolves(true)
            mockLdkClient.removeDebugDeployment.resolves(true)
            mockLdkClient.deleteDebugVersion.resolves(true)

            await controller.stopDebugging()

            // Assert state is cleaned up
            assert.strictEqual(controller.isDebugging, false, 'Should not be in debugging state')

            // Verify cleanup operations
            assert(mockLdkClient.stopProxy.calledOnce, 'Should stop proxy')
            assert(mockLdkClient.removeDebugDeployment.calledOnce, 'Should remove debug deployment')
            assert(mockLdkClient.deleteDebugVersion.calledOnce, 'Should delete debug version')
        })

        it('should handle stop debugging when not debugging', async () => {
            controller.isDebugging = false

            await controller.stopDebugging()

            // Should complete without error when not debugging
            assert.strictEqual(controller.isDebugging, false, 'Should remain not debugging')
        })

        it('should handle cleanup errors gracefully', async () => {
            // Mock VSCode APIs
            sandbox.stub(vscode.commands, 'executeCommand').resolves()

            controller.isDebugging = true

            const mockFunctionConfig = {
                FunctionName: 'testFunction',
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
            }
            // Set up the snapshot in mock state
            await mockGlobalState.update('aws.lambda.remoteDebugSnapshot', mockFunctionConfig)

            // Mock cleanup failure
            mockLdkClient.stopProxy.rejects(new Error('Cleanup failed'))
            mockLdkClient.removeDebugDeployment.resolves(true)

            await assert.rejects(
                async () => await controller.stopDebugging(),
                /error when stopping remote debug/,
                'Should throw error on cleanup failure'
            )

            // State should still be cleaned up
            assert.strictEqual(controller.isDebugging, false, 'Should clean up state even on error')
        })
    })

    describe('Snapshot Management', () => {
        it('should get lambda snapshot from global state', async () => {
            const mockSnapshot = {
                FunctionName: 'testFunction',
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
            }
            // Set up the snapshot in mock state
            await mockGlobalState.update('aws.lambda.remoteDebugSnapshot', mockSnapshot)

            const result = getLambdaSnapshot()

            assert.deepStrictEqual(result, mockSnapshot, 'Should return snapshot from global state')
        })

        it('should return undefined when no snapshot exists', () => {
            const result = getLambdaSnapshot()

            assert.strictEqual(result, undefined, 'Should return undefined when no snapshot')
        })
    })

    describe('Telemetry Verification', () => {
        let mockConfig: DebugConfig
        let mockFunctionConfig: Lambda.FunctionConfiguration

        beforeEach(() => {
            mockConfig = createMockDebugConfig({
                layerArn: 'arn:aws:lambda:us-west-2:123456789012:layer:LDKLayerX86:6',
            })

            mockFunctionConfig = createMockFunctionConfig()
        })

        it('should emit lambda_remoteDebugStart telemetry for successful debugging start', async () => {
            // Mock VSCode APIs
            setupMockVSCodeDebugAPIs(sandbox)

            // Mock runtime support
            sandbox.stub(controller, 'supportRuntimeRemoteDebug').returns(true)

            // Mock successful LdkClient operations
            setupMockLdkClientOperations(mockLdkClient, mockFunctionConfig)

            // Mock revertExistingConfig
            setupMockRevertExistingConfig(sandbox)

            await controller.startDebugging(mockConfig.functionArn, 'nodejs18.x', mockConfig)

            // Verify telemetry was emitted
            assertTelemetry('lambda_remoteDebugStart', {
                result: 'Succeeded',
                source: 'remoteDebug',
                action: '{"port":9229,"remoteRoot":"/var/task","skipFiles":[],"shouldPublishVersion":false,"lambdaTimeout":900,"layerArn":"arn:aws:lambda:us-west-2:123456789012:layer:LDKLayerX86:6"}',
                runtimeString: 'nodejs18.x',
            })
        })

        it('should emit lambda_remoteDebugStart telemetry for version publishing', async () => {
            // Mock VSCode APIs
            setupMockVSCodeDebugAPIs(sandbox)

            // Mock runtime support
            sandbox.stub(controller, 'supportRuntimeRemoteDebug').returns(true)

            const versionConfig = { ...mockConfig, shouldPublishVersion: true }

            // Mock successful LdkClient operations with version publishing
            setupMockLdkClientOperations(mockLdkClient, mockFunctionConfig)
            mockLdkClient.createDebugDeployment.resolves('v1')

            // Mock revertExistingConfig
            setupMockRevertExistingConfig(sandbox)

            await controller.startDebugging(versionConfig.functionArn, 'nodejs18.x', versionConfig)

            // Verify telemetry was emitted with version action
            assertTelemetry('lambda_remoteDebugStart', {
                result: 'Succeeded',
                source: 'remoteDebug',
                action: '{"port":9229,"remoteRoot":"/var/task","skipFiles":[],"shouldPublishVersion":true,"lambdaTimeout":900,"layerArn":"arn:aws:lambda:us-west-2:123456789012:layer:LDKLayerX86:6"}',
                runtimeString: 'nodejs18.x',
            })
        })

        it('should emit lambda_remoteDebugStart telemetry for failed debugging start', async () => {
            // Mock VSCode APIs
            setupMockVSCodeDebugAPIs(sandbox)

            // Mock runtime support
            sandbox.stub(controller, 'supportRuntimeRemoteDebug').returns(true)

            // Mock function config retrieval success but tunnel creation failure
            setupMockLdkClientOperations(mockLdkClient, mockFunctionConfig)
            mockLdkClient.createOrReuseTunnel.rejects(new Error('Tunnel creation failed'))

            // Mock revertExistingConfig
            setupMockRevertExistingConfig(sandbox)

            try {
                await controller.startDebugging(mockConfig.functionArn, 'nodejs18.x', mockConfig)
            } catch (error) {
                // Expected to throw
            }

            // Verify telemetry was emitted for failure
            assertTelemetry('lambda_remoteDebugStart', {
                result: 'Failed',
                source: 'remoteDebug',
                action: '{"port":9229,"remoteRoot":"/var/task","skipFiles":[],"shouldPublishVersion":false,"lambdaTimeout":900,"layerArn":"arn:aws:lambda:us-west-2:123456789012:layer:LDKLayerX86:6"}',
                runtimeString: 'nodejs18.x',
            })
        })

        it('should emit lambda_remoteDebugStop telemetry for successful debugging stop', async () => {
            // Mock VSCode APIs
            sandbox.stub(vscode.commands, 'executeCommand').resolves()

            // Set up debugging state
            controller.isDebugging = true
            controller.qualifier = 'v1'
            ;(controller as any).lastDebugStartTime = Date.now() - 5000 // 5 seconds ago

            const mockFunctionConfig = {
                FunctionName: 'testFunction',
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
            }
            // Set up the snapshot in mock state
            await mockGlobalState.update('aws.lambda.remoteDebugSnapshot', mockFunctionConfig)

            // Mock successful cleanup operations
            mockLdkClient.stopProxy.resolves(true)
            mockLdkClient.removeDebugDeployment.resolves(true)
            mockLdkClient.deleteDebugVersion.resolves(true)

            await controller.stopDebugging()

            // Verify telemetry was emitted
            assertTelemetry('lambda_remoteDebugStop', {
                result: 'Succeeded',
            })
        })

        it('should emit lambda_remoteDebugStop telemetry for failed debugging stop', async () => {
            // Mock VSCode APIs
            sandbox.stub(vscode.commands, 'executeCommand').resolves()

            controller.isDebugging = true

            const mockFunctionConfig = {
                FunctionName: 'testFunction',
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
            }
            // Set up the snapshot in mock state
            await mockGlobalState.update('aws.lambda.remoteDebugSnapshot', mockFunctionConfig)

            // Mock cleanup failure
            mockLdkClient.stopProxy.rejects(new Error('Cleanup failed'))
            mockLdkClient.removeDebugDeployment.resolves(true)

            try {
                await controller.stopDebugging()
            } catch (error) {
                // Expected to throw
            }

            // Verify telemetry was emitted for failure
            assertTelemetry('lambda_remoteDebugStop', {
                result: 'Failed',
            })
        })
    })
})

describe('Module Functions', () => {
    let sandbox: sinon.SinonSandbox
    let mockGlobalState: any

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        // Mock global state with actual storage
        mockGlobalState = createMockGlobalState()
        sandbox.stub(globals, 'globalState').value(mockGlobalState)
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('activateRemoteDebugging', () => {
        it('should activate remote debugging and ensure clean state', async () => {
            // Mock revertExistingConfig
            sandbox
                .stub(require('../../../lambda/remoteDebugging/ldkController'), 'revertExistingConfig')
                .resolves(true)

            // Mock controller
            const mockController = {
                ensureCleanState: sandbox.stub(),
            }
            sandbox.stub(RemoteDebugController, 'instance').get(() => mockController)

            await activateRemoteDebugging()

            assert(mockController.ensureCleanState.calledOnce, 'Should ensure clean state')
        })

        it('should handle activation errors gracefully', async () => {
            // Mock revertExistingConfig to throw error
            sandbox
                .stub(require('../../../lambda/remoteDebugging/ldkController'), 'revertExistingConfig')
                .rejects(new Error('Revert failed'))

            // Should not throw error, just handle gracefully
            await activateRemoteDebugging()

            // Test passes if no error is thrown
            assert(true, 'Should handle activation errors gracefully')
        })
    })

    describe('revertExistingConfig', () => {
        let mockLdkClient: SinonStubbedInstance<LdkClient>

        beforeEach(() => {
            mockLdkClient = createStubInstance(LdkClient)
            sandbox.stub(LdkClient, 'instance').get(() => mockLdkClient)
        })

        it('should return true when no existing config', async () => {
            // mockGlobalState.get.returns(undefined)

            const result = await revertExistingConfig()

            assert.strictEqual(result, true, 'Should return true when no config to revert')
        })

        it('should revert existing config successfully', async () => {
            const mockSnapshot = {
                FunctionName: 'testFunction',
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
                Timeout: 30,
            }
            const mockCurrentConfig = {
                FunctionName: 'testFunction',
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
                Timeout: 900, // Different from snapshot
            }

            // Set up the snapshot in mock state
            await mockGlobalState.update('aws.lambda.remoteDebugSnapshot', mockSnapshot)
            mockLdkClient.getFunctionDetail.resolves(mockCurrentConfig)
            mockLdkClient.removeDebugDeployment.resolves(true)

            const showConfirmationStub = sandbox.stub(messages, 'showConfirmationMessage').resolves(true)
            const result = await revertExistingConfig()

            assert.strictEqual(result, true, 'Should return true on successful revert')
            assert(showConfirmationStub.calledOnce, 'Should show confirmation dialog')
            assert(mockLdkClient.removeDebugDeployment.calledWith(mockSnapshot, false), 'Should revert config')
        })

        it('should handle user cancellation of revert', async () => {
            const mockSnapshot = {
                FunctionName: 'testFunction',
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
            }
            const mockCurrentConfig = {
                FunctionName: 'testFunction',
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
                Timeout: 900,
            }

            // Set up the snapshot in mock state
            await mockGlobalState.update('aws.lambda.remoteDebugSnapshot', mockSnapshot)
            mockLdkClient.getFunctionDetail.resolves(mockCurrentConfig)

            sandbox.stub(messages, 'showConfirmationMessage').resolves(false)

            const result = await revertExistingConfig()

            assert.strictEqual(result, true, 'Should return true when user cancels')
            // Verify snapshot was cleared
            assert.strictEqual(
                mockGlobalState.get('aws.lambda.remoteDebugSnapshot'),
                undefined,
                'Should clear snapshot'
            )
        })

        it('should handle corrupted snapshot gracefully', async () => {
            const corruptedSnapshot = {
                // Missing FunctionArn and FunctionName
                Timeout: 30,
            }

            // Set up corrupted snapshot in mock state
            await mockGlobalState.update('aws.lambda.remoteDebugSnapshot', corruptedSnapshot)

            const result = await revertExistingConfig()

            assert.strictEqual(result, true, 'Should return true for corrupted snapshot')
            // Verify snapshot was cleared
            assert.strictEqual(
                mockGlobalState.get('aws.lambda.remoteDebugSnapshot'),
                undefined,
                'Should clear corrupted snapshot'
            )
        })

        it('should handle revert errors', async () => {
            const mockSnapshot = {
                FunctionName: 'testFunction',
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
            }

            // Set up the snapshot in mock state
            await mockGlobalState.update('aws.lambda.remoteDebugSnapshot', mockSnapshot)
            mockLdkClient.getFunctionDetail.rejects(new Error('Failed to get function'))

            await assert.rejects(
                async () => await revertExistingConfig(),
                /Error in revertExistingConfig/,
                'Should throw error on revert failure'
            )
        })
    })
})
