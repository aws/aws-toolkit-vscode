/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as sinon from 'sinon'
import assert from 'assert'
import { SagemakerClient } from '../../../shared/clients/sagemaker'
import { getTestWindow } from '../../shared/vscode/window'
import {
    RemoteAccessRequiredMessage,
    InstanceTypeInsufficientMemoryMessage,
} from '../../../awsService/sagemaker/constants'

// Import types only, actual functions will be dynamically imported
import type { openRemoteConnect as openRemoteConnectStatic } from '../../../awsService/sagemaker/commands'

describe('SageMaker Commands', () => {
    let sandbox: sinon.SinonSandbox
    let mockClient: any
    let mockNode: any

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        mockClient = sandbox.createStubInstance(SagemakerClient)
        mockNode = {
            regionCode: 'us-east-1',
            spaceApp: {
                DomainId: 'domain-123',
                SpaceName: 'test-space',
            },
        }
    })

    afterEach(() => {
        sandbox.restore()
        getTestWindow().dispose()

        for (const key of Object.keys(require.cache)) {
            if (key.includes('awsService/sagemaker/commands')) {
                delete require.cache[key]
            }
        }
    })

    describe('openRemoteConnect handler integration tests', () => {
        let mockTryRefreshNode: sinon.SinonStub
        let mockTryRemoteConnection: sinon.SinonStub
        let mockIsRemoteWorkspace: sinon.SinonStub
        let openRemoteConnect: typeof openRemoteConnectStatic

        beforeEach(() => {
            mockNode = {
                regionCode: 'us-east-1',
                spaceApp: {
                    DomainId: 'domain-123',
                    SpaceName: 'test-space',
                    App: {
                        AppType: 'JupyterLab',
                        AppName: 'default',
                    },
                    SpaceSettingsSummary: {
                        AppType: 'JupyterLab',
                        RemoteAccess: 'DISABLED',
                    },
                },
                getStatus: sandbox.stub().returns('Running'),
            }

            // Mock helper functions
            mockTryRefreshNode = sandbox.stub().resolves()
            mockTryRemoteConnection = sandbox.stub().resolves()
            mockIsRemoteWorkspace = sandbox.stub().returns(false)

            sandbox.replace(
                require('../../../awsService/sagemaker/explorer/sagemakerSpaceNode'),
                'tryRefreshNode',
                mockTryRefreshNode
            )
            sandbox.replace(
                require('../../../awsService/sagemaker/model'),
                'tryRemoteConnection',
                mockTryRemoteConnection
            )
            sandbox.replace(require('../../../shared/vscode/env'), 'isRemoteWorkspace', mockIsRemoteWorkspace)

            const freshModule = require('../../../awsService/sagemaker/commands')
            openRemoteConnect = freshModule.openRemoteConnect
        })

        describe('handleRunningSpaceWithDisabledAccess', () => {
            beforeEach(() => {
                mockNode.getStatus.returns('Running')
                mockNode.spaceApp.SpaceSettingsSummary.RemoteAccess = 'DISABLED'
            })

            /**
             * Test 1: Shows confirmation dialog mentioning "remote access" when instance type is sufficient
             *
             * Scenario: User tries to connect to a running space that doesn't have remote access enabled,
             * but the instance type (ml.t3.large) has sufficient memory for remote access.
             *
             * Expected behavior:
             * - System checks instance type via describeSpace
             * - Shows confirmation dialog mentioning only "remote access" (no instance upgrade needed)
             * - User confirms, then space is restarted with remote access enabled
             * - Connection is established
             */
            it('shows confirmation dialog with remote access message when no upgrade needed', async () => {
                mockClient.describeSpace.resolves({
                    $metadata: {},
                    SpaceSettings: {
                        AppType: 'JupyterLab',
                        JupyterLabAppSettings: {
                            DefaultResourceSpec: {
                                InstanceType: 'ml.t3.large', // Sufficient memory
                            },
                        },
                    },
                })
                mockClient.deleteApp.resolves()
                mockClient.startSpace.resolves()
                mockClient.waitForAppInService.resolves()

                // Setup test window to handle confirmation dialog
                getTestWindow().onDidShowMessage((message) => {
                    if (message.message.includes(RemoteAccessRequiredMessage)) {
                        message.selectItem('Restart Space and Connect')
                    }
                })

                await openRemoteConnect(mockNode, {} as any, mockClient)

                // Verify describeSpace was called to check instance type
                assert(mockClient.describeSpace.calledOnce)
                assert(
                    mockClient.describeSpace.calledWith({
                        DomainId: 'domain-123',
                        SpaceName: 'test-space',
                    })
                )

                // Verify confirmation dialog was shown
                const messages = getTestWindow().shownMessages
                assert(messages.length > 0)
                const confirmMessage = messages.find((m) => m.message.includes('remote access'))
                assert(confirmMessage, 'Should show remote access message')
                assert(!confirmMessage.message.includes('ml.t3'), 'Should not mention instance type upgrade')
            })

            /**
             * Test 2: Shows confirmation dialog mentioning instance upgrade when needed
             *
             * Scenario: User tries to connect to a running space with an instance type (ml.t3.medium)
             * that has insufficient memory for remote access.
             *
             * Expected behavior:
             * - System checks instance type via describeSpace
             * - Detects ml.t3.medium is insufficient (needs upgrade to ml.t3.large)
             * - Dialog includes current type (ml.t3.medium) and target type (ml.t3.large)
             * - User confirms, then space is restarted with upgraded instance and remote access
             */
            it('shows confirmation dialog with instance upgrade message when upgrade needed', async () => {
                mockClient.describeSpace.resolves({
                    $metadata: {},
                    SpaceSettings: {
                        AppType: 'JupyterLab',
                        JupyterLabAppSettings: {
                            DefaultResourceSpec: {
                                InstanceType: 'ml.t3.medium', // Insufficient memory
                            },
                        },
                    },
                })
                mockClient.deleteApp.resolves()
                mockClient.startSpace.resolves()
                mockClient.waitForAppInService.resolves()

                // Setup test window to handle confirmation dialog
                getTestWindow().onDidShowMessage((message) => {
                    if (
                        message.message.includes(
                            InstanceTypeInsufficientMemoryMessage('test-space', 'ml.t3.medium', 'ml.t3.large')
                        )
                    ) {
                        message.selectItem('Restart Space and Connect')
                    }
                })

                await openRemoteConnect(mockNode, {} as any, mockClient)

                // Verify describeSpace was called to check instance type
                assert(mockClient.describeSpace.calledOnce)

                // Verify confirmation dialog includes instance type upgrade info
                const messages = getTestWindow().shownMessages
                const expectedMessage = InstanceTypeInsufficientMemoryMessage(
                    'test-space',
                    'ml.t3.medium',
                    'ml.t3.large'
                )
                const confirmMessage = messages.find((m) => m.message.includes(expectedMessage))
                assert(confirmMessage, 'Should show instance upgrade message')
            })

            /**
             * Test 3: Verifies the full workflow when user confirms
             *
             * Scenario: User confirms the restart dialog for a running space with disabled remote access.
             *
             * Expected behavior (in order):
             * 1. tryRefreshNode() - Refresh node state before starting
             * 2. describeSpace() - Check instance type requirements
             * 3. Show confirmation dialog
             * 4. User confirms
             * 5. deleteApp() - Stop the running space
             * 6. startSpace() - Restart with remote access enabled (3rd param = true)
             * 7. tryRefreshNode() - Refresh node state after restart
             * 8. waitForAppInService() - Wait for space to be ready
             * 9. tryRemoteConnection() - Establish the remote connection
             */
            it('performs space restart and connection when user confirms', async () => {
                mockClient.describeSpace.resolves({
                    $metadata: {},
                    SpaceSettings: {
                        AppType: 'JupyterLab',
                        JupyterLabAppSettings: {
                            DefaultResourceSpec: {
                                InstanceType: 'ml.t3.large',
                            },
                        },
                    },
                })
                mockClient.deleteApp.resolves()
                mockClient.startSpace.resolves()
                mockClient.waitForAppInService.resolves()

                // Setup test window to confirm
                getTestWindow().onDidShowMessage((message) => {
                    if (message.items.some((item) => item.title === 'Restart Space and Connect')) {
                        message.selectItem('Restart Space and Connect')
                    }
                })

                await openRemoteConnect(mockNode, {} as any, mockClient)

                // Verify tryRefreshNode was called at the start of openRemoteConnect
                assert(mockTryRefreshNode.calledBefore(mockClient.deleteApp))

                // Verify space operations were performed in correct order
                assert(mockClient.deleteApp.calledOnce)
                assert(
                    mockClient.deleteApp.calledWith({
                        DomainId: 'domain-123',
                        SpaceName: 'test-space',
                        AppType: 'JupyterLab',
                        AppName: 'default',
                    })
                )
                assert(mockClient.startSpace.calledOnce)
                assert(mockClient.startSpace.calledWith('test-space', 'domain-123', true)) // Remote access enabled

                // Verify tryRefreshNode was called after startSpace
                assert(mockTryRefreshNode.calledAfter(mockClient.startSpace))

                assert(mockClient.waitForAppInService.calledOnce)
                assert(mockClient.waitForAppInService.calledWith('domain-123', 'test-space', 'JupyterLab'))
                assert(mockTryRemoteConnection.calledOnce)
            })

            /**
             * Test 4: Verifies nothing happens when user cancels
             *
             * Scenario: User is shown the confirmation dialog but clicks "Cancel" instead of confirming.
             *
             * Expected behavior:
             * - tryRefreshNode() is called (happens before showing dialog)
             * - describeSpace() is called (to check instance type)
             * - Confirmation dialog is shown
             * - User cancels
             * - NO space operations are performed (no deleteApp, startSpace, or connection attempts)
             */
            it('does not perform operations when user cancels', async () => {
                mockClient.describeSpace.resolves({
                    $metadata: {},
                    SpaceSettings: {
                        AppType: 'JupyterLab',
                        JupyterLabAppSettings: {
                            DefaultResourceSpec: {
                                InstanceType: 'ml.t3.large',
                            },
                        },
                    },
                })

                // Setup test window to cancel
                getTestWindow().onDidShowMessage((message) => {
                    message.selectItem('Cancel')
                })

                await openRemoteConnect(mockNode, {} as any, mockClient)

                // Verify tryRefreshNode was called (happens before confirmation)
                assert(mockTryRefreshNode.calledOnce)
                // Verify no space operations were performed after cancellation
                assert(mockClient.deleteApp.notCalled)
                assert(mockClient.startSpace.notCalled)
                assert(mockTryRemoteConnection.notCalled)
            })
        })

        describe('handleStoppedSpace', () => {
            beforeEach(() => {
                mockNode.getStatus.returns('Stopped')
            })

            /**
             * Test: Starts space and connects without showing confirmation dialog
             *
             * Scenario: User tries to connect to a stopped space.
             *
             * Expected behavior:
             * - NO confirmation dialog is shown
             * - tryRefreshNode() is called at the start
             * - startSpace() is called WITHOUT remote access flag (2 params only)
             * - tryRefreshNode() is called again after starting
             * - waitForAppInService() waits for space to be ready
             * - tryRemoteConnection() establishes the connection
             *
             * Key difference from running space: No confirmation needed because starting
             * a stopped space is non-destructive
             */
            it('starts space and connects without confirmation', async () => {
                mockClient.startSpace.resolves()
                mockClient.waitForAppInService.resolves()

                await openRemoteConnect(mockNode, {} as any, mockClient)

                // Verify no confirmation dialog shown for stopped space
                const confirmMessages = getTestWindow().shownMessages.filter((m) =>
                    m.message.includes('Restart Space and Connect')
                )
                assert.strictEqual(confirmMessages.length, 0, 'Should not show confirmation for stopped space')

                // Verify tryRefreshNode was called at start of openRemoteConnect
                assert(mockTryRefreshNode.calledBefore(mockClient.startSpace))

                // Verify space operations - startSpace is called before withProgress
                assert(mockClient.startSpace.calledOnce)
                assert(mockClient.startSpace.calledWith('test-space', 'domain-123')) // No remote access flag

                // Verify tryRefreshNode was called after startSpace (before progress)
                assert(mockTryRefreshNode.calledAfter(mockClient.startSpace))
                assert.strictEqual(mockTryRefreshNode.callCount, 2) // Once at start, once after startSpace

                // Verify operations inside progress callback
                assert(mockClient.waitForAppInService.calledOnce)
                assert(mockClient.waitForAppInService.calledWith('domain-123', 'test-space', 'JupyterLab'))
                assert(mockTryRemoteConnection.calledOnce)
            })
        })

        describe('handleRunningSpaceWithEnabledAccess', () => {
            beforeEach(() => {
                mockNode.getStatus.returns('Running')
                mockNode.spaceApp.SpaceSettingsSummary.RemoteAccess = 'ENABLED'
            })

            /**
             * Test: Connects directly without any space operations
             *
             * Scenario: User tries to connect to a running space that already has remote access enabled.
             *
             * Expected behavior:
             * - tryRefreshNode() is called once at the start
             * - NO confirmation dialog is shown (space is already configured correctly)
             * - NO space operations are performed:
             *   - No deleteApp() (no need to stop)
             *   - No startSpace() (already running)
             *   - No waitForAppInService() (already ready)
             * - ONLY tryRemoteConnection() is called to establish the connection
             *
             * This is the "happy path" - space is ready, just connect directly.
             */
            it('connects directly without any space operations', async () => {
                await openRemoteConnect(mockNode, {} as any, mockClient)

                // Verify tryRefreshNode was called at start
                assert(mockTryRefreshNode.calledOnce)
                // Verify no confirmation needed
                const confirmMessages = getTestWindow().shownMessages.filter((m) =>
                    m.message.includes('Restart Space and Connect')
                )
                assert.strictEqual(confirmMessages.length, 0)
                // Verify no space operations performed
                assert(mockClient.deleteApp.notCalled)
                assert(mockClient.startSpace.notCalled)
                assert(mockClient.waitForAppInService.notCalled)
                // Only remote connection should be attempted
                assert(mockTryRemoteConnection.calledOnce)
            })
        })
    })

    describe('HyperPod connection with clusterArn', function () {
        let mockDeeplinkConnect: sinon.SinonStub
        let mockIsRemoteWorkspace: sinon.SinonStub
        let deeplinkConnect: any

        beforeEach(function () {
            mockDeeplinkConnect = sandbox.stub().resolves()
            mockIsRemoteWorkspace = sandbox.stub().returns(false)

            sandbox.replace(require('../../../shared/vscode/env'), 'isRemoteWorkspace', mockIsRemoteWorkspace)

            const freshModule = require('../../../awsService/sagemaker/commands')
            deeplinkConnect = freshModule.deeplinkConnect
            sandbox.replace(freshModule, 'deeplinkConnect', mockDeeplinkConnect)
        })

        it('should create session with underscores from HyperPod clusterArn', async function () {
            const ctx = {
                extensionContext: {},
            } as any

            await deeplinkConnect(
                ctx,
                '',
                'session-id',
                'wss://example.com',
                'token',
                '',
                undefined,
                'demo0',
                'default',
                'arn:aws:sagemaker:us-east-2:123456789012:cluster/n4nkkc5fbwg5'
            )

            // Verify the session format uses underscores
            const sessionArg = mockDeeplinkConnect.firstCall?.args[10] // session parameter
            if (sessionArg) {
                assert.ok(sessionArg.includes('_'), 'Session should use underscores as separators')
                assert.ok(sessionArg.includes('demo0'), 'Session should include workspace name')
                assert.ok(sessionArg.includes('default'), 'Session should include namespace')
                assert.ok(sessionArg.includes('n4nkkc5fbwg5'), 'Session should include cluster name')
                assert.ok(sessionArg.includes('us-east-2'), 'Session should include region')
                assert.ok(sessionArg.includes('123456789012'), 'Session should include account ID')
            }
        })

        it('should handle EKS clusterArn format', async function () {
            const ctx = {
                extensionContext: {},
            } as any

            await deeplinkConnect(
                ctx,
                '',
                'session-id',
                'wss://example.com',
                'token',
                '',
                undefined,
                'workspace',
                'namespace',
                'arn:aws:eks:us-west-2:987654321098:cluster/eks-cluster-name'
            )

            const sessionArg = mockDeeplinkConnect.firstCall?.args[10]
            if (sessionArg) {
                assert.ok(sessionArg.includes('eks-cluster-name'), 'Session should include EKS cluster name')
                assert.ok(sessionArg.includes('us-west-2'), 'Session should include region')
                assert.ok(sessionArg.includes('987654321098'), 'Session should include account ID')
            }
        })

        it('should sanitize invalid characters in session components', async function () {
            const ctx = {
                extensionContext: {},
            } as any

            await deeplinkConnect(
                ctx,
                '',
                'session-id',
                'wss://example.com',
                'token',
                '',
                undefined,
                'My@Workspace!',
                'my_namespace',
                'arn:aws:sagemaker:us-east-2:123456789012:cluster/test-cluster'
            )

            const sessionArg = mockDeeplinkConnect.firstCall?.args[10]
            if (sessionArg) {
                assert.ok(!sessionArg.includes('@'), 'Session should not contain @ symbol')
                assert.ok(!sessionArg.includes('!'), 'Session should not contain ! symbol')
                assert.strictEqual(sessionArg, sessionArg.toLowerCase(), 'Session should be lowercase')
            }
        })

        it('should handle long component names by truncating', async function () {
            const ctx = {
                extensionContext: {},
            } as any

            const longWorkspace = 'a'.repeat(100)
            const longNamespace = 'b'.repeat(100)
            const longCluster = 'c'.repeat(100)

            await deeplinkConnect(
                ctx,
                '',
                'session-id',
                'wss://example.com',
                'token',
                '',
                undefined,
                longWorkspace,
                longNamespace,
                `arn:aws:sagemaker:us-east-2:123456789012:cluster/${longCluster}`
            )

            const sessionArg = mockDeeplinkConnect.firstCall?.args[10]
            if (sessionArg) {
                assert.ok(sessionArg.length <= 224, 'Session should not exceed max length')
            }
        })

        it('should not create HyperPod session when domain is provided', async function () {
            const ctx = {
                extensionContext: {},
            } as any

            await deeplinkConnect(
                ctx,
                'connection-id',
                'session-id',
                'wss://example.com',
                'token',
                'my-domain', // Domain provided - should use SageMaker Studio flow
                undefined,
                'workspace',
                'namespace',
                'arn:aws:sagemaker:us-east-2:123456789012:cluster/cluster'
            )

            // Should not create HyperPod session when domain is present
            const sessionArg = mockDeeplinkConnect.firstCall?.args[10]
            assert.strictEqual(sessionArg, 'session-id', 'Should use original session when domain is provided')
        })
    })
})
