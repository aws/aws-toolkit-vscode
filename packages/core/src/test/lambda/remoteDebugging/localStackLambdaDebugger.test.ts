/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon, { SinonStubbedInstance, createStubInstance } from 'sinon'
import { LdkClient } from '../../../lambda/remoteDebugging/ldkClient'
import { RemoteDebugController } from '../../../lambda/remoteDebugging/ldkController'
import globals from '../../../shared/extensionGlobals'

import {
    createMockDebugConfig,
    createMockFunctionConfig,
    createMockGlobalState,
    setupMockRevertExistingConfig,
    setupMockVSCodeDebugAPIs,
} from './testUtils'
import { DebugConfig } from '../../../lambda/remoteDebugging/lambdaDebugger'
import { Lambda } from 'aws-sdk'
import { assertTelemetry } from '../../testUtil'
import * as remoteDebuggingUtils from '../../../lambda/remoteDebugging/utils'
import { DefaultLambdaClient } from '../../../shared/clients/lambdaClient'

const LocalStackEndpoint = 'https://localhost.localstack.cloud:4566'

describe('RemoteDebugController with LocalStackLambdaDebugger', () => {
    let sandbox: sinon.SinonSandbox
    let mockLdkClient: SinonStubbedInstance<LdkClient>
    let controller: RemoteDebugController
    let mockGlobalState: any
    let mockConfig: DebugConfig
    let mockFunctionConfig: Lambda.FunctionConfiguration
    let fetchStub: sinon.SinonStub

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        fetchStub = sandbox.stub(global, 'fetch')

        // Mock LdkClient
        mockLdkClient = createStubInstance(LdkClient)
        sandbox.stub(LdkClient, 'instance').get(() => mockLdkClient)

        // Mock global state with actual storage
        mockGlobalState = createMockGlobalState()
        sandbox.stub(globals, 'globalState').value(mockGlobalState)
        sandbox.stub(globals.awsContext, 'getCredentialEndpointUrl').returns(LocalStackEndpoint)

        // Get controller instance
        controller = RemoteDebugController.instance

        // Ensure clean state
        controller.ensureCleanState()

        mockConfig = createMockDebugConfig({
            isLambdaRemote: false,
            port: undefined,
            layerArn: undefined,
            lambdaTimeout: undefined,
        })
        mockFunctionConfig = createMockFunctionConfig()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('Debug Session Management', () => {
        it('should start debugging successfully', async () => {
            // Mock VSCode APIs
            setupMockVSCodeDebugAPIs(sandbox)

            // Mock runtime support
            sandbox.stub(controller, 'supportRuntimeRemoteDebug').returns(true)

            // Mock successful LdkClient operations
            mockLdkClient.getFunctionDetail.resolves(mockFunctionConfig)

            // Mock waiting for Lambda function to be active
            sandbox.stub(remoteDebuggingUtils, 'getLambdaClientWithAgent').returns(
                sandbox.createStubInstance(DefaultLambdaClient, {
                    waitForActive: sandbox.stub().resolves() as any,
                }) as any
            )

            // Mock revertExistingConfig
            setupMockRevertExistingConfig(sandbox)

            // Mock LocalStack health check
            const fetchStubHealth = fetchStub.withArgs(`${LocalStackEndpoint}/_localstack/health`)
            fetchStubHealth.resolves(new Response(undefined, { status: 200 }))

            // Mock LocalStack debug config setup
            const assignedPort = 8228
            const userAgent =
                'LAMBDA-DEBUG/1.0.0 AWS-Toolkit-For-VSCode/testPluginVersion Visual-Studio-Code/1.102.2 ClientId/11111111-1111-1111-1111-111111111111'
            const fetchStubSetup = fetchStub.withArgs(
                `${LocalStackEndpoint}/_aws/lambda/debug_configs/${mockFunctionConfig.FunctionArn}:$LATEST`,
                {
                    method: 'PUT',
                    body: sinon.match.string,
                }
            )
            fetchStubSetup.resolves(
                new Response(
                    JSON.stringify({
                        port: assignedPort,
                        user_agent: userAgent,
                    }),
                    { status: 200 }
                )
            )

            // Mock LocalStack debug config polling
            const fetchStubStatus = fetchStub.withArgs(
                `${LocalStackEndpoint}/_aws/lambda/debug_configs/${mockFunctionConfig.FunctionArn}:$LATEST?debug_server_ready_timeout=300`
            )
            fetchStubStatus.resolves(
                new Response(
                    JSON.stringify({
                        port: assignedPort,
                        user_agent: userAgent,
                        is_debug_server_running: true,
                    }),
                    { status: 200 }
                )
            )

            await controller.startDebugging(mockConfig.functionArn, 'nodejs18.x', mockConfig)

            // Assert state changes
            assert.strictEqual(controller.isDebugging, true, 'Should be in debugging state')
            // Qualifier is only set for version publishing, not for $LATEST
            assert.strictEqual(controller.qualifier, undefined, 'Should not set qualifier for $LATEST')

            // Verify LdkClient calls
            assert(mockLdkClient.getFunctionDetail.calledWith(mockConfig.functionArn), 'Should get function details')

            assert(fetchStubHealth.calledOnce, 'Should call LocalStack health check once')
            assert(fetchStubSetup.calledOnce, 'Should call LocalStack LDM setup once')
            assert(fetchStubStatus.calledOnce, 'Should call LocalStack LDM status once')

            assertTelemetry('lambda_remoteDebugStart', {
                result: 'Succeeded',
                source: 'LocalStackDebug',
                action: '{"remoteRoot":"/var/task","skipFiles":[],"shouldPublishVersion":false,"isLambdaRemote":false}',
                runtimeString: 'nodejs18.x',
            })
        })

        it('should handle debugging start failure and cleanup', async () => {
            // Mock VSCode APIs
            setupMockVSCodeDebugAPIs(sandbox)

            // Mock runtime support
            sandbox.stub(controller, 'supportRuntimeRemoteDebug').returns(true)

            // Mock function config retrieval
            mockLdkClient.getFunctionDetail.resolves(mockFunctionConfig)

            // Mock LocalStack health check
            const fetchStubHealth = fetchStub.withArgs(`${LocalStackEndpoint}/_localstack/health`)
            fetchStubHealth.resolves(new Response(undefined, { status: 200 }))

            // Mock LocalStack debug config setup error
            const fetchStubSetup = fetchStub.withArgs(
                `${LocalStackEndpoint}/_aws/lambda/debug_configs/${mockFunctionConfig.FunctionArn}:$LATEST`,
                {
                    method: 'PUT',
                    body: sinon.match.string,
                }
            )
            fetchStubSetup.resolves(new Response('Unknown error occurred during setup', { status: 500 }))

            // Mock LocalStack debug config cleanup
            const fetchStubCleanup = fetchStub.withArgs(
                `${LocalStackEndpoint}/_aws/lambda/debug_configs/${mockFunctionConfig.FunctionArn}:$LATEST`,
                {
                    method: 'DELETE',
                }
            )
            fetchStubCleanup.resolves(new Response(undefined, { status: 200 }))

            // Mock revertExistingConfig
            setupMockRevertExistingConfig(sandbox)

            let errorThrown = false
            try {
                await controller.startDebugging(mockConfig.functionArn, 'nodejs18.x', mockConfig)
            } catch (error) {
                errorThrown = true
                assert(error instanceof Error, 'Should throw an error')
                assert(
                    error.message.includes('Error StartDebugging') ||
                        error.message.includes(
                            'Failed to startup execution environment or debugger for Lambda function'
                        ),
                    'Should throw relevant error'
                )
            }

            assert(errorThrown, 'Should have thrown an error')

            // Assert state is cleaned up
            assert.strictEqual(controller.isDebugging, false, 'Should not be in debugging state after failure')
            assert(fetchStubCleanup.calledOnce, 'Should attempt cleanup')
        })
    })

    describe('Stop Debugging', () => {
        it('should stop debugging successfully', async () => {
            // Mock VSCode APIs
            sandbox.stub(vscode.commands, 'executeCommand').resolves()

            // Set up debugging state
            controller.isDebugging = true
            controller.qualifier = '$LATEST'
            ;(controller as any).lastDebugStartTime = Date.now() - 5000 // 5 seconds ago
            mockGlobalState.update('aws.lambda.remoteDebugSnapshot', mockFunctionConfig)

            // Mock successful cleanup
            const fetchStubCleanup = fetchStub.withArgs(
                `${LocalStackEndpoint}/_aws/lambda/debug_configs/${mockFunctionConfig.FunctionArn}:$LATEST`,
                {
                    method: 'DELETE',
                }
            )
            fetchStubCleanup.resolves(new Response(undefined, { status: 200 }))

            await controller.stopDebugging()

            // Assert state is cleaned up
            assert.strictEqual(controller.isDebugging, false, 'Should not be in debugging state')

            // Verify cleanup operations
            assert(fetchStubCleanup.calledOnce, 'Should cleanup the LocalStack debug config')
            assertTelemetry('lambda_remoteDebugStop', {
                result: 'Succeeded',
            })
        })
    })
})
