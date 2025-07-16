/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { Lambda } from 'aws-sdk'
import { LdkClient, getRegionFromArn, isTunnelInfo } from '../../../lambda/remoteDebugging/ldkClient'
import { LocalProxy } from '../../../lambda/remoteDebugging/localProxy'
import * as utils from '../../../lambda/remoteDebugging/utils'
import * as telemetryUtil from '../../../shared/telemetry/util'
import globals from '../../../shared/extensionGlobals'
import { createMockFunctionConfig, createMockProgress } from './testUtils'

describe('LdkClient', () => {
    let sandbox: sinon.SinonSandbox
    let ldkClient: LdkClient
    let mockLambdaClient: any
    let mockIoTSTClient: any
    let mockLocalProxy: any

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        // Mock Lambda client
        mockLambdaClient = {
            getFunction: sandbox.stub(),
            updateFunctionConfiguration: sandbox.stub(),
            publishVersion: sandbox.stub(),
            deleteFunction: sandbox.stub(),
        }
        sandbox.stub(utils, 'getLambdaClientWithAgent').returns(mockLambdaClient)

        // Mock IoT ST client with proper promise structure
        const createPromiseStub = () => sandbox.stub()
        mockIoTSTClient = {
            listTunnels: sandbox.stub().returns({ promise: createPromiseStub() }),
            openTunnel: sandbox.stub().returns({ promise: createPromiseStub() }),
            closeTunnel: sandbox.stub().returns({ promise: createPromiseStub() }),
            rotateTunnelAccessToken: sandbox.stub().returns({ promise: createPromiseStub() }),
        }
        sandbox.stub(utils, 'getIoTSTClientWithAgent').resolves(mockIoTSTClient)

        // Mock LocalProxy
        mockLocalProxy = {
            start: sandbox.stub(),
            stop: sandbox.stub(),
        }
        sandbox.stub(LocalProxy.prototype, 'start').callsFake(mockLocalProxy.start)
        sandbox.stub(LocalProxy.prototype, 'stop').callsFake(mockLocalProxy.stop)

        // Mock global state
        const stateStorage = new Map<string, any>()
        const mockGlobalState = {
            get: (key: string) => stateStorage.get(key),
            update: async (key: string, value: any) => {
                stateStorage.set(key, value)
                return Promise.resolve()
            },
        }
        sandbox.stub(globals, 'globalState').value(mockGlobalState)

        // Mock telemetry util
        sandbox.stub(telemetryUtil, 'getClientId').returns('test-client-id')
        ldkClient = LdkClient.instance
        ldkClient.dispose()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('Singleton Pattern', () => {
        it('should return the same instance', () => {
            const instance1 = LdkClient.instance
            const instance2 = LdkClient.instance
            assert.strictEqual(instance1, instance2, 'Should return the same singleton instance')
        })
    })

    describe('dispose()', () => {
        it('should dispose resources properly', () => {
            // Set up a mock local proxy
            ;(ldkClient as any).localProxy = mockLocalProxy

            ldkClient.dispose()

            assert(mockLocalProxy.stop.calledOnce, 'Should stop local proxy')
            assert.strictEqual((ldkClient as any).localProxy, undefined, 'Should clear local proxy reference')
        })

        it('should clear client caches', () => {
            // Add some clients to cache
            ;(ldkClient as any).lambdaClientCache.set('us-east-1', mockLambdaClient)
            ;(ldkClient as any).lambdaClientCache.set('us-west-2', mockLambdaClient)

            assert.strictEqual((ldkClient as any).lambdaClientCache.size, 2, 'Should have cached clients')

            ldkClient.dispose()

            assert.strictEqual((ldkClient as any).lambdaClientCache.size, 0, 'Should clear Lambda client cache')
        })
    })

    describe('createOrReuseTunnel()', () => {
        it('should create new tunnel when none exists', async () => {
            mockIoTSTClient.listTunnels().promise.resolves({ tunnelSummaries: [] })
            mockIoTSTClient.openTunnel().promise.resolves({
                tunnelId: 'tunnel-123',
                sourceAccessToken: 'source-token',
                destinationAccessToken: 'dest-token',
            })

            const result = await ldkClient.createOrReuseTunnel('us-east-1')

            assert(result, 'Should return tunnel info')
            assert.strictEqual(result?.tunnelID, 'tunnel-123')
            assert.strictEqual(result?.sourceToken, 'source-token')
            assert.strictEqual(result?.destinationToken, 'dest-token')
            assert(mockIoTSTClient.listTunnels.called, 'Should list existing tunnels')
            assert(mockIoTSTClient.openTunnel.called, 'Should create new tunnel')
        })

        it('should reuse existing tunnel with sufficient time remaining', async () => {
            const existingTunnel = {
                tunnelId: 'existing-tunnel',
                description: 'RemoteDebugging+test-client-id',
                status: 'OPEN',
                createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
            }

            mockIoTSTClient.listTunnels().promise.resolves({ tunnelSummaries: [existingTunnel] })
            mockIoTSTClient.rotateTunnelAccessToken().promise.resolves({
                sourceAccessToken: 'rotated-source-token',
                destinationAccessToken: 'rotated-dest-token',
            })

            const result = await ldkClient.createOrReuseTunnel('us-east-1')

            assert(result, 'Should return tunnel info')
            assert.strictEqual(result?.tunnelID, 'existing-tunnel')
            assert.strictEqual(result?.sourceToken, 'rotated-source-token')
            assert.strictEqual(result?.destinationToken, 'rotated-dest-token')
        })

        it('should handle tunnel creation errors', async () => {
            mockIoTSTClient.listTunnels().promise.resolves({ tunnelSummaries: [] })
            mockIoTSTClient.openTunnel().promise.rejects(new Error('Tunnel creation failed'))

            await assert.rejects(
                async () => await ldkClient.createOrReuseTunnel('us-east-1'),
                /Error creating\/reusing tunnel/,
                'Should throw error on tunnel creation failure'
            )
        })
    })

    describe('refreshTunnelTokens()', () => {
        it('should refresh tunnel tokens successfully', async () => {
            mockIoTSTClient.rotateTunnelAccessToken().promise.resolves({
                sourceAccessToken: 'new-source-token',
                destinationAccessToken: 'new-dest-token',
            })

            const result = await ldkClient.refreshTunnelTokens('tunnel-123', 'us-east-1')

            assert(result, 'Should return tunnel info')
            assert.strictEqual(result?.tunnelID, 'tunnel-123')
            assert.strictEqual(result?.sourceToken, 'new-source-token')
            assert.strictEqual(result?.destinationToken, 'new-dest-token')
        })

        it('should handle token refresh errors', async () => {
            mockIoTSTClient.rotateTunnelAccessToken().promise.rejects(new Error('Token refresh failed'))

            await assert.rejects(
                async () => await ldkClient.refreshTunnelTokens('tunnel-123', 'us-east-1'),
                /Error refreshing tunnel tokens/,
                'Should throw error on token refresh failure'
            )
        })
    })

    describe('getFunctionDetail()', () => {
        const mockFunctionConfig: Lambda.FunctionConfiguration = createMockFunctionConfig({
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:testFunction',
        })

        it('should get function details successfully', async () => {
            mockLambdaClient.getFunction.resolves({ Configuration: mockFunctionConfig })

            const result = await ldkClient.getFunctionDetail(mockFunctionConfig.FunctionArn!)

            assert.deepStrictEqual(result, mockFunctionConfig, 'Should return function configuration')
        })

        it('should handle function details retrieval errors', async () => {
            mockLambdaClient.getFunction.reset()
            mockLambdaClient.getFunction.rejects(new Error('Function not found'))

            const result = await ldkClient.getFunctionDetail(mockFunctionConfig.FunctionArn!)

            assert.strictEqual(result, undefined, 'Should return undefined on error')
        })

        it('should handle invalid ARN', async () => {
            const result = await ldkClient.getFunctionDetail('invalid-arn')

            assert.strictEqual(result, undefined, 'Should return undefined for invalid ARN')
        })
    })

    describe('createDebugDeployment()', () => {
        const mockFunctionConfig: Lambda.FunctionConfiguration = createMockFunctionConfig({
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:testFunction',
        })

        const mockProgress = createMockProgress()

        beforeEach(() => {
            mockLambdaClient.updateFunctionConfiguration.resolves({})
            mockLambdaClient.publishVersion.resolves({ Version: 'v1' })
        })

        it('should create debug deployment successfully without version publishing', async () => {
            const result = await ldkClient.createDebugDeployment(
                mockFunctionConfig,
                'dest-token',
                900,
                false,
                'layer-arn',
                mockProgress as any
            )

            assert.strictEqual(result, '$Latest', 'Should return $Latest for non-version deployment')
            assert(mockLambdaClient.updateFunctionConfiguration.calledOnce, 'Should update function configuration')
            assert(mockLambdaClient.publishVersion.notCalled, 'Should not publish version')
        })

        it('should create debug deployment with version publishing', async () => {
            const result = await ldkClient.createDebugDeployment(
                mockFunctionConfig,
                'dest-token',
                900,
                true,
                'layer-arn',
                mockProgress as any
            )

            assert.strictEqual(result, 'v1', 'Should return version number')
            assert(mockLambdaClient.publishVersion.calledOnce, 'Should publish version')
        })

        it('should handle deployment errors', async () => {
            mockLambdaClient.updateFunctionConfiguration.reset()
            mockLambdaClient.updateFunctionConfiguration.rejects(new Error('Update failed'))

            await assert.rejects(
                async () =>
                    await ldkClient.createDebugDeployment(
                        mockFunctionConfig,
                        'dest-token',
                        900,
                        false,
                        'layer-arn',
                        mockProgress as any
                    ),
                /Failed to create debug deployment/,
                'Should throw error on deployment failure'
            )
        })

        it('should handle missing function ARN', async () => {
            const configWithoutArn = { ...mockFunctionConfig, FunctionArn: undefined }

            await assert.rejects(
                async () =>
                    await ldkClient.createDebugDeployment(
                        configWithoutArn,
                        'dest-token',
                        900,
                        false,
                        'layer-arn',
                        mockProgress as any
                    ),
                /Function ARN is missing/,
                'Should throw error for missing ARN'
            )
        })
    })

    describe('removeDebugDeployment()', () => {
        const mockFunctionConfig: Lambda.FunctionConfiguration = createMockFunctionConfig({
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:testFunction',
        })

        beforeEach(() => {
            mockLambdaClient.updateFunctionConfiguration.resolves({})
        })

        it('should remove debug deployment successfully', async () => {
            const result = await ldkClient.removeDebugDeployment(mockFunctionConfig, false)

            assert.strictEqual(result, true, 'Should return true on successful removal')
            assert(mockLambdaClient.updateFunctionConfiguration.calledOnce, 'Should update function configuration')
        })

        it('should handle removal errors', async () => {
            mockLambdaClient.updateFunctionConfiguration.rejects(new Error('Update failed'))

            await assert.rejects(
                async () => await ldkClient.removeDebugDeployment(mockFunctionConfig, false),
                /Error removing debug deployment/,
                'Should throw error on removal failure'
            )
        })

        it('should handle missing function ARN', async () => {
            const configWithoutArn = { ...mockFunctionConfig, FunctionArn: undefined, FunctionName: undefined }

            await assert.rejects(
                async () => await ldkClient.removeDebugDeployment(configWithoutArn, false),
                /Error removing debug deployment/,
                'Should throw error for missing ARN'
            )
        })
    })

    describe('deleteDebugVersion()', () => {
        it('should delete debug version successfully', async () => {
            mockLambdaClient.deleteFunction.resolves({})

            const result = await ldkClient.deleteDebugVersion(
                'arn:aws:lambda:us-east-1:123456789012:function:testFunction',
                'v1'
            )

            assert.strictEqual(result, true, 'Should return true on successful deletion')
            assert(mockLambdaClient.deleteFunction.calledOnce, 'Should call deleteFunction')
        })

        it('should handle version deletion errors', async () => {
            mockLambdaClient.deleteFunction.rejects(new Error('Delete failed'))

            const result = await ldkClient.deleteDebugVersion(
                'arn:aws:lambda:us-east-1:123456789012:function:testFunction',
                'v1'
            )

            assert.strictEqual(result, false, 'Should return false on deletion error')
        })

        it('should handle invalid ARN for version deletion', async () => {
            const result = await ldkClient.deleteDebugVersion('invalid-arn', 'v1')

            assert.strictEqual(result, false, 'Should return false for invalid ARN')
        })
    })

    describe('startProxy()', () => {
        beforeEach(() => {
            mockLocalProxy.start.resolves(9229)
            mockLocalProxy.stop.returns()
        })

        it('should start proxy successfully', async () => {
            const result = await ldkClient.startProxy('us-east-1', 'source-token', 9229)

            assert.strictEqual(result, true, 'Should return true on successful start')
            assert(
                mockLocalProxy.start.calledWith('us-east-1', 'source-token', 9229),
                'Should start proxy with correct parameters'
            )
        })

        it('should stop existing proxy before starting new one', async () => {
            // Create a spy for the stop method
            const stopSpy = sandbox.spy()

            // Set up existing proxy with the spy
            ;(ldkClient as any).localProxy = { stop: stopSpy }

            await ldkClient.startProxy('us-east-1', 'source-token', 9229)

            assert(stopSpy.called, 'Should stop existing proxy')
        })

        it('should handle proxy start errors', async () => {
            mockLocalProxy.start.rejects(new Error('Proxy start failed'))

            await assert.rejects(
                async () => await ldkClient.startProxy('us-east-1', 'source-token', 9229),
                /Failed to start proxy/,
                'Should throw error on proxy start failure'
            )
        })
    })

    describe('stopProxy()', () => {
        it('should stop proxy successfully', async () => {
            // Set up existing proxy
            ;(ldkClient as any).localProxy = { stop: mockLocalProxy.stop }

            const result = await ldkClient.stopProxy()

            assert.strictEqual(result, true, 'Should return true on successful stop')
            assert(mockLocalProxy.stop.calledOnce, 'Should stop proxy')
            assert.strictEqual((ldkClient as any).localProxy, undefined, 'Should clear proxy reference')
        })

        it('should handle stopping when no proxy exists', async () => {
            const result = await ldkClient.stopProxy()

            assert.strictEqual(result, true, 'Should return true when no proxy to stop')
        })
    })
})

describe('Helper Functions', () => {
    describe('getRegionFromArn', () => {
        it('should extract region from valid ARN', () => {
            const arn = 'arn:aws:lambda:us-east-1:123456789012:function:testFunction'
            const result = getRegionFromArn(arn)
            assert.strictEqual(result, 'us-east-1', 'Should extract region correctly')
        })

        it('should handle undefined ARN', () => {
            const result = getRegionFromArn(undefined)
            assert.strictEqual(result, undefined, 'Should return undefined for undefined ARN')
        })

        it('should handle invalid ARN format', () => {
            const result = getRegionFromArn('invalid-arn')
            assert.strictEqual(result, undefined, 'Should return undefined for invalid ARN')
        })

        it('should handle ARN with insufficient parts', () => {
            const result = getRegionFromArn('arn:aws:lambda')
            assert.strictEqual(result, undefined, 'Should return undefined for ARN with insufficient parts')
        })
    })

    describe('isTunnelInfo', () => {
        it('should validate correct tunnel info', () => {
            const tunnelInfo = {
                tunnelID: 'tunnel-123',
                sourceToken: 'source-token',
                destinationToken: 'dest-token',
            }
            const result = isTunnelInfo(tunnelInfo)
            assert.strictEqual(result, true, 'Should validate correct tunnel info')
        })

        it('should reject invalid tunnel info', () => {
            const invalidTunnelInfo = {
                tunnelID: 'tunnel-123',
                sourceToken: 'source-token',
                // missing destinationToken
            }
            const result = isTunnelInfo(invalidTunnelInfo as any)
            assert.strictEqual(result, false, 'Should reject invalid tunnel info')
        })

        it('should reject non-object types', () => {
            assert.strictEqual(isTunnelInfo('string' as any), false, 'Should reject string')
            assert.strictEqual(isTunnelInfo(123 as any), false, 'Should reject number')
            assert.strictEqual(isTunnelInfo(undefined as any), false, 'Should reject undefined')
        })
    })
})
