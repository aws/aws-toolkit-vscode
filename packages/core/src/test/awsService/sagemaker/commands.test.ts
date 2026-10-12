/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as sinon from 'sinon'
import assert from 'assert'
import * as vscode from 'vscode'
import { SagemakerClient } from '../../../shared/clients/sagemaker'
import { getTestWindow } from '../../shared/vscode/window'
import {
    RemoteAccessRequiredMessage,
    InstanceTypeInsufficientMemoryMessage,
} from '../../../awsService/sagemaker/constants'
import { getDomainUserProfileKey } from '../../../awsService/sagemaker/utils'
import { SessionStore } from '../../../awsService/sagemaker/detached-server/sessionStore'
import { handleRefreshToken } from '../../../awsService/sagemaker/detached-server/routes/refreshToken'

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

        describe('handleIdcDomainConnect', () => {
            const spaceArn = 'arn:aws:sagemaker:us-west-2:123456789:space/d-abc123/my-space'
            const idcContext = {
                globalStorageUri: { fsPath: '/test-storage' },
            } as any

            let mockOpenExternal: sinon.SinonStub
            let mockPrepareDevEnvConnection: sinon.SinonStub
            let mockUseSageMakerSshKiroExtension: sinon.SinonStub
            let mockPreRegisterIdcConnection: sinon.SinonStub
            let mockGetIdcConnectionStatus: sinon.SinonStub
            let mockReadFileText: sinon.SinonStub
            let mockSleep: sinon.SinonStub
            let mockStartVscodeRemote: sinon.SinonStub
            let SagemakerSpaceNodeClass: any

            function makeSagemakerNode(
                options: {
                    authMode?: 'SSO' | 'IAM'
                    status?: string
                    remoteAccess?: string
                    domainId?: string
                    userProfile?: string
                    spaceName?: string
                } = {}
            ) {
                const authMode = options.authMode ?? 'SSO'
                const status = options.status ?? 'Running'
                const remoteAccess = Object.prototype.hasOwnProperty.call(options, 'remoteAccess')
                    ? options.remoteAccess
                    : 'ENABLED'
                const domainId = options.domainId ?? 'd-abc123'
                const userProfile = options.userProfile ?? 'user-profile-1'
                const spaceName = options.spaceName ?? 'my-space'
                const key = getDomainUserProfileKey(domainId, userProfile)
                const node = Object.create(SagemakerSpaceNodeClass.prototype)

                Object.assign(node, {
                    regionCode: 'us-west-2',
                    spaceApp: {
                        DomainId: domainId,
                        SpaceName: spaceName,
                        App: { AppType: 'JupyterLab', AppName: 'default' },
                        OwnershipSettingsSummary: { OwnerUserProfileName: userProfile },
                        SpaceSettingsSummary: { AppType: 'JupyterLab', RemoteAccess: remoteAccess },
                    },
                    parent: {
                        domainUserProfiles: new Map([[key, { domain: { AuthMode: authMode } }]]),
                    },
                    getStatus: sandbox.stub().returns(status),
                    getSpaceArn: sandbox.stub().resolves(spaceArn),
                })

                return node
            }

            beforeEach(() => {
                mockOpenExternal = sandbox.stub().resolves(true)
                mockPrepareDevEnvConnection = sandbox.stub().resolves({
                    SessionProcess: { pid: 1234 },
                    hostname: 'sagemaker-space',
                    vscPath: '/path/to/vscode',
                })
                mockUseSageMakerSshKiroExtension = sandbox.stub().returns(false)
                mockPreRegisterIdcConnection = sandbox.stub().resolves()
                mockGetIdcConnectionStatus = sandbox.stub().resolves('fresh')
                mockReadFileText = sandbox.stub().resolves(JSON.stringify({ pid: 1234, port: 54321 }))
                mockSleep = sandbox.stub().resolves()
                mockStartVscodeRemote = sandbox.stub().resolves()

                sandbox.replace(vscode.env, 'openExternal', mockOpenExternal)
                sandbox.stub(require('../../../shared/settings').DevSettings.instance, 'get').returns({})

                SagemakerSpaceNodeClass =
                    require('../../../awsService/sagemaker/explorer/sagemakerSpaceNode').SagemakerSpaceNode

                const model = require('../../../awsService/sagemaker/model')
                sandbox.replace(model, 'prepareDevEnvConnection', mockPrepareDevEnvConnection)
                sandbox.replace(model, 'useSageMakerSshKiroExtension', mockUseSageMakerSshKiroExtension)

                const credentialMapping = require('../../../awsService/sagemaker/credentialMapping')
                sandbox.replace(credentialMapping, 'preRegisterIdcConnection', mockPreRegisterIdcConnection)
                sandbox.replace(credentialMapping, 'getIdcConnectionStatus', mockGetIdcConnectionStatus)

                sandbox.replace(require('../../../shared/fs/fs').fs, 'readFileText', mockReadFileText)
                sandbox.replace(require('../../../shared/utilities/timeoutUtils'), 'sleep', mockSleep)
                sandbox.replace(require('../../../shared/extensions/ssh'), 'startVscodeRemote', mockStartVscodeRemote)

                for (const key of Object.keys(require.cache)) {
                    if (key.includes('awsService/sagemaker/commands')) {
                        delete require.cache[key]
                    }
                }
                openRemoteConnect = require('../../../awsService/sagemaker/commands').openRemoteConnect
            })

            it('opens Studio without a requestId and launches the remote after the 302 callback', async () => {
                const session = {
                    sessionId: 'stub-session',
                    token: 'stub-token',
                    url: 'wss://stub-session.example.test',
                }
                let connectionStatus = 'pending'
                let studioRedirect: { status: 302; headers: { location: string } } | undefined
                const callbackWriteHead = sandbox.stub()
                const callbackEnd = sandbox.stub()
                const setSession = sandbox
                    .stub(SessionStore.prototype, 'setSession')
                    .callsFake(async (connectionIdentifier, requestId, connection) => {
                        assert.strictEqual(connectionIdentifier, spaceArn)
                        assert.strictEqual(requestId, 'initial-connection')
                        assert.deepStrictEqual(connection, session)
                        connectionStatus = 'fresh'
                    })

                mockGetIdcConnectionStatus.resetBehavior()
                mockGetIdcConnectionStatus.callsFake(async () => connectionStatus)
                mockOpenExternal.resetBehavior()
                mockOpenExternal.callsFake(async (uri: vscode.Uri) => {
                    // Studio returns 'initial-connection' on the callback when the launch URL omits requestId.
                    const callbackUrl = new URLSearchParams(uri.query).get('callbackUrl')
                    assert.ok(callbackUrl)

                    const location = new URL(callbackUrl)
                    location.searchParams.set('connection_identifier', spaceArn)
                    location.searchParams.set('request_id', 'initial-connection')
                    location.searchParams.set('ws_url', session.url)
                    location.searchParams.set('token', session.token)
                    location.searchParams.set('session', session.sessionId)
                    studioRedirect = { status: 302, headers: { location: location.toString() } }
                    return true
                })
                mockSleep.resetBehavior()
                mockSleep.callsFake(async () => {
                    assert.strictEqual(mockSleep.callCount, 1, 'the callback should complete during the first poll')
                    assert.ok(studioRedirect)
                    assert.strictEqual(studioRedirect.status, 302)
                    const location = new URL(studioRedirect.headers.location)
                    await handleRefreshToken(
                        { url: `${location.pathname}${location.search}` } as any,
                        { writeHead: callbackWriteHead, end: callbackEnd } as any
                    )
                })
                const idcNode = makeSagemakerNode()

                await openRemoteConnect(idcNode, idcContext, mockClient)

                sinon.assert.calledOnceWithExactly(mockPreRegisterIdcConnection, spaceArn, 'd-abc123', 'JupyterLab')
                sinon.assert.calledOnce(mockPrepareDevEnvConnection)
                assert.deepStrictEqual(mockPrepareDevEnvConnection.firstCall.args[0], {
                    spaceArn,
                    ctx: idcContext,
                    connectionType: 'sm_dl',
                    isSMUS: false,
                    node: idcNode,
                    domain: 'd-abc123',
                    appType: 'JupyterLab',
                })
                sinon.assert.calledOnce(mockReadFileText)
                sinon.assert.calledOnce(mockOpenExternal)

                const uri = mockOpenExternal.firstCall.args[0]
                const query = new URLSearchParams(uri.query)
                assert.strictEqual(uri.scheme, 'https')
                assert.strictEqual(uri.authority, 'studio-d-abc123.studio.us-west-2.sagemaker.aws')
                assert.strictEqual(uri.path, '/remote-connect')
                assert.strictEqual(query.get('spaceArn'), spaceArn)
                assert.strictEqual(query.get('appType'), 'JupyterLab')
                assert.strictEqual(query.get('callbackUrl'), 'http://localhost:54321/refresh_token')
                assert.strictEqual(query.has('requestId'), false)

                assert.ok(studioRedirect)
                const callbackUrl = new URL(studioRedirect.headers.location)
                assert.strictEqual(callbackUrl.pathname, '/refresh_token')
                assert.strictEqual(callbackUrl.searchParams.get('connection_identifier'), spaceArn)
                assert.strictEqual(callbackUrl.searchParams.get('request_id'), 'initial-connection')
                sinon.assert.calledOnceWithExactly(setSession, spaceArn, 'initial-connection', session)
                sinon.assert.calledWith(callbackWriteHead, 200)
                sinon.assert.callCount(mockGetIdcConnectionStatus, 2)
                sinon.assert.calledOnceWithExactly(mockSleep, 2000)
                sinon.assert.calledWith(
                    mockStartVscodeRemote,
                    sinon.match({ pid: 1234 }),
                    'sagemaker-space',
                    '/home/sagemaker-user',
                    '/path/to/vscode',
                    'sagemaker-user'
                )
                assert(mockOpenExternal.calledBefore(mockGetIdcConnectionStatus))
                assert(setSession.calledBefore(mockStartVscodeRemote))
                assert(mockGetIdcConnectionStatus.calledBefore(mockStartVscodeRemote))
                sinon.assert.notCalled(mockTryRemoteConnection)
                sinon.assert.notCalled(mockClient.createApp)
                sinon.assert.notCalled(mockClient.deleteApp)
                sinon.assert.notCalled(mockClient.startSpace)
                sinon.assert.notCalled(mockClient.updateSpace)
            })

            it('does not redirect for IAM domains', async () => {
                const iamNode = makeSagemakerNode({
                    authMode: 'IAM',
                    domainId: 'd-iam456',
                    userProfile: 'iam-user',
                    spaceName: 'iam-space',
                })

                await openRemoteConnect(iamNode, idcContext, mockClient)

                sinon.assert.notCalled(mockOpenExternal)
                sinon.assert.notCalled(mockPreRegisterIdcConnection)
                sinon.assert.calledOnce(mockTryRemoteConnection)
            })

            it('does not redirect for SMUS nodes', async () => {
                mockNode.spaceApp.SpaceSettingsSummary.RemoteAccess = 'ENABLED'

                await openRemoteConnect(mockNode, idcContext, mockClient)

                sinon.assert.notCalled(mockOpenExternal)
                sinon.assert.notCalled(mockPreRegisterIdcConnection)
                sinon.assert.calledOnce(mockTryRemoteConnection)
            })

            it('does not poll or launch a remote when the browser cannot be opened', async () => {
                mockOpenExternal.resolves(false)

                await openRemoteConnect(makeSagemakerNode(), idcContext, mockClient)

                sinon.assert.notCalled(mockGetIdcConnectionStatus)
                sinon.assert.notCalled(mockStartVscodeRemote)
                assert(
                    getTestWindow().shownMessages.some((message) => message.message.includes('Failed to open browser'))
                )
            })

            it('stops waiting when authentication is cancelled', async () => {
                mockGetIdcConnectionStatus.resolves('pending')
                getTestWindow().onDidShowMessage((message) => {
                    if (message.message === 'Connecting to my-space') {
                        message.selectItem('Cancel')
                    }
                })

                await openRemoteConnect(makeSagemakerNode(), idcContext, mockClient)

                sinon.assert.calledOnce(mockOpenExternal)
                sinon.assert.notCalled(mockStartVscodeRemote)
            })

            it('reports a timeout when the browser callback never supplies credentials', async () => {
                let now = 0
                sandbox.stub(Date, 'now').callsFake(() => now)
                mockGetIdcConnectionStatus.resolves('pending')
                mockSleep.callsFake(async () => {
                    now = 5 * 60 * 1000
                })

                await openRemoteConnect(makeSagemakerNode(), idcContext, mockClient)

                sinon.assert.calledOnceWithExactly(mockGetIdcConnectionStatus, spaceArn)
                sinon.assert.calledOnceWithExactly(mockSleep, 2000)
                sinon.assert.notCalled(mockStartVscodeRemote)
                assert(
                    getTestWindow().shownMessages.some((message) =>
                        message.message.includes('Timed out waiting for authentication')
                    )
                )
            })

            /**
             * Space preparation parity with the IAM path.
             *
             * The IdC handler has to reproduce openRemoteConnect's state routing, because it
             * intercepts before the IAM dispatch. These tests pin that routing so it cannot
             * silently drift from handleRunningSpaceWithDisabledAccess / handleStoppedSpace.
             */
            describe('space preparation', () => {
                function makeIdcNode(status: string, remoteAccess?: string) {
                    return makeSagemakerNode({
                        status,
                        remoteAccess,
                    })
                }

                beforeEach(() => {
                    mockClient.describeSpace.resolves({
                        $metadata: {},
                        SpaceSettings: {
                            AppType: 'JupyterLab',
                            JupyterLabAppSettings: {
                                DefaultResourceSpec: { InstanceType: 'ml.t3.medium' }, // insufficient memory
                            },
                        },
                    })
                    mockClient.deleteApp.resolves()
                    mockClient.startSpace.resolves()
                    mockClient.waitForAppInService.resolves()
                })

                it('asks for confirmation before restarting a running space with remote access off', async () => {
                    let shown = false
                    getTestWindow().onDidShowMessage((message) => {
                        if (message.message.includes('does not support remote access')) {
                            shown = true
                        }
                        message.selectItem('Cancel')
                    })

                    await openRemoteConnect(makeIdcNode('Running', 'DISABLED'), idcContext, mockClient)

                    assert(shown, 'should prompt before changing the instance type')
                })

                it('makes no changes when the user declines the restart', async () => {
                    getTestWindow().onDidShowMessage((message) => message.selectItem('Cancel'))

                    await openRemoteConnect(makeIdcNode('Running', 'DISABLED'), idcContext, mockClient)

                    assert(mockClient.deleteApp.notCalled, 'must not stop the app after a cancel')
                    assert(mockClient.startSpace.notCalled, 'must not start the space after a cancel')
                    assert(mockOpenExternal.notCalled, 'must not open the browser after a cancel')
                })

                it('stops the running app before restarting it with remote access enabled', async () => {
                    getTestWindow().onDidShowMessage((message) => {
                        if (message.items.some((item) => item.title === 'Restart Space and Connect')) {
                            message.selectItem('Restart Space and Connect')
                        }
                    })

                    await openRemoteConnect(makeIdcNode('Running', 'DISABLED'), idcContext, mockClient)

                    // deleteApp first: startSpace ends in createApp('default'), which fails if an
                    // app of that name is already running.
                    assert(mockClient.deleteApp.calledOnce, 'should stop the live app')
                    assert(mockClient.startSpace.calledOnce)
                    assert(
                        mockClient.startSpace.calledAfter(mockClient.deleteApp),
                        'startSpace must run after deleteApp'
                    )
                    // Skipping the prompts is only legitimate because consent was just obtained.
                    assert(mockClient.startSpace.calledWith('my-space', 'd-abc123', true))
                })

                it('starts a stopped space without suppressing the instance-type prompt', async () => {
                    await openRemoteConnect(makeIdcNode('Stopped', 'DISABLED'), idcContext, mockClient)

                    assert(mockClient.deleteApp.notCalled, 'nothing to stop on a stopped space')
                    assert(mockClient.startSpace.calledOnce)
                    // The third argument must not be true here: startSpace has to keep its own
                    // instance-type prompt so the user still consents to any upgrade.
                    assert(
                        mockClient.startSpace.neverCalledWith('my-space', 'd-abc123', true),
                        'must not skip the instance-type prompt for a stopped space'
                    )
                })

                it('does not touch a running space that already has remote access enabled', async () => {
                    await openRemoteConnect(makeIdcNode('Running', 'ENABLED'), idcContext, mockClient)

                    assert(mockClient.deleteApp.notCalled)
                    assert(mockClient.startSpace.notCalled)
                    sinon.assert.calledOnce(mockStartVscodeRemote)
                })

                it('refuses to act on a space that is mid-transition', async () => {
                    await openRemoteConnect(makeIdcNode('Starting', 'ENABLED'), idcContext, mockClient)

                    assert(mockClient.deleteApp.notCalled)
                    assert(mockClient.startSpace.notCalled)
                    assert(mockOpenExternal.notCalled)
                    const messages = getTestWindow().shownMessages
                    assert(
                        messages.some((m) => m.message.includes('is Starting')),
                        'should tell the user the space is still transitioning'
                    )
                })

                it('refuses to act on a space that is stopping', async () => {
                    await openRemoteConnect(makeIdcNode('Stopping', 'ENABLED'), idcContext, mockClient)

                    assert(mockClient.deleteApp.notCalled)
                    assert(mockClient.startSpace.notCalled)
                    assert(mockOpenExternal.notCalled)
                    const messages = getTestWindow().shownMessages
                    assert(
                        messages.some((m) => m.message.includes('is Stopping')),
                        'should tell the user the space is still transitioning'
                    )
                })

                it('starts a stopped space whose remote access is already enabled, without stopping it first', async () => {
                    await openRemoteConnect(makeIdcNode('Stopped', 'ENABLED'), idcContext, mockClient)

                    assert(mockClient.deleteApp.notCalled, 'there is no live app to stop')
                    assert(mockClient.startSpace.calledOnce)
                    // The remote-access value must not leak into the stopped path: this is the one
                    // state the old single-guard code got right, so it is the likeliest regression.
                    assert(
                        mockClient.startSpace.neverCalledWith('my-space', 'd-abc123', true),
                        'must not skip the instance-type prompt for a stopped space'
                    )
                })

                // RemoteAccess is simply absent on a space that never had it set, and the routing
                // treats absent and DISABLED alike (remoteAccess !== ENABLED).
                it('treats absent RemoteAccess on a running space the same as disabled', async () => {
                    getTestWindow().onDidShowMessage((message) => {
                        if (message.items.some((item) => item.title === 'Restart Space and Connect')) {
                            message.selectItem('Restart Space and Connect')
                        }
                    })

                    await openRemoteConnect(makeIdcNode('Running', undefined), idcContext, mockClient)

                    assert(mockClient.deleteApp.calledOnce, 'should stop the live app')
                    assert(
                        mockClient.startSpace.calledAfter(mockClient.deleteApp),
                        'startSpace must run after deleteApp'
                    )
                    assert(mockClient.startSpace.calledWith('my-space', 'd-abc123', true))
                })

                it('treats absent RemoteAccess on a stopped space the same as disabled', async () => {
                    await openRemoteConnect(makeIdcNode('Stopped', undefined), idcContext, mockClient)

                    assert(mockClient.deleteApp.notCalled)
                    assert(mockClient.startSpace.calledOnce)
                    assert(
                        mockClient.startSpace.neverCalledWith('my-space', 'd-abc123', true),
                        'must not skip the instance-type prompt for a stopped space'
                    )
                })
            })
        })
    })
})
