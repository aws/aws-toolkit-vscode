/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { activate } from '../../../sagemakerunifiedstudio/explorer/activation'
import {
    SmusAuthenticationProvider,
    setSmusConnectedContext,
} from '../../../sagemakerunifiedstudio/auth/providers/smusAuthenticationProvider'
import { ResourceTreeDataProvider } from '../../../shared/treeview/resourceTreeDataProvider'
import { SageMakerUnifiedStudioRootNode } from '../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioRootNode'
import { getLogger } from '../../../shared/logger/logger'
import { getTestWindow } from '../../shared/vscode/window'
import { SeverityLevel } from '../../shared/vscode/message'
import * as extensionUtilities from '../../../shared/extensionUtilities'
import { createMockSpaceNode } from '../testUtils'
import { DataZoneClient } from '../../../sagemakerunifiedstudio/shared/client/datazoneClient'
import * as model from '../../../sagemakerunifiedstudio/auth/model'

describe('SMUS Explorer Activation', function () {
    let mockExtensionContext: vscode.ExtensionContext
    let mockSmusAuthProvider: sinon.SinonStubbedInstance<SmusAuthenticationProvider>
    let mockTreeView: sinon.SinonStubbedInstance<vscode.TreeView<any>>
    let mockTreeDataProvider: sinon.SinonStubbedInstance<ResourceTreeDataProvider>
    let mockSmusRootNode: sinon.SinonStubbedInstance<SageMakerUnifiedStudioRootNode>
    let createTreeViewStub: sinon.SinonStub
    let registerCommandStub: sinon.SinonStub
    let dataZoneDisposeStub: sinon.SinonStub
    let setupUserActivityMonitoringStub: sinon.SinonStub

    beforeEach(async function () {
        mockExtensionContext = {
            subscriptions: [],
        } as any

        mockSmusAuthProvider = {
            restore: sinon.stub().resolves(),
            isConnected: sinon.stub().returns(true),
            reauthenticate: sinon.stub().resolves(),
            onDidChange: sinon.stub().callsFake((_listener: () => void) => ({ dispose: sinon.stub() })),
            onDidChangeActiveConnection: sinon.stub().callsFake((_listener: () => void) => ({ dispose: sinon.stub() })),
            activeConnection: {
                id: 'test-connection',
                domainId: 'test-domain',
                ssoRegion: 'us-east-1',
            },
            getDomainAccountId: sinon.stub().resolves('123456789012'),
        } as any

        mockTreeView = {
            dispose: sinon.stub(),
        } as any

        mockTreeDataProvider = {
            refresh: sinon.stub(),
        } as any

        mockSmusRootNode = {
            getChildren: sinon.stub().resolves([]),
            getProjectSelectNode: sinon.stub().returns({
                getProject: sinon.stub().returns({ id: 'test-project', name: 'Test Project' }),
                refreshNode: sinon.stub().resolves(),
            }),
        } as any

        // Stub vscode APIs
        createTreeViewStub = sinon.stub(vscode.window, 'createTreeView').returns(mockTreeView as any)
        registerCommandStub = sinon.stub(vscode.commands, 'registerCommand').returns({ dispose: sinon.stub() } as any)

        // Stub SmusAuthenticationProvider
        sinon.stub(SmusAuthenticationProvider, 'fromContext').returns(mockSmusAuthProvider as any)

        // Stub DataZoneClient.dispose
        dataZoneDisposeStub = sinon.stub(DataZoneClient, 'dispose')

        // Stub SageMakerUnifiedStudioRootNode constructor
        sinon.stub(SageMakerUnifiedStudioRootNode.prototype, 'getChildren').returns(mockSmusRootNode.getChildren())
        sinon
            .stub(SageMakerUnifiedStudioRootNode.prototype, 'getProjectSelectNode')
            .returns(mockSmusRootNode.getProjectSelectNode())

        // Stub ResourceTreeDataProvider constructor
        sinon.stub(ResourceTreeDataProvider.prototype, 'refresh').value(mockTreeDataProvider.refresh)

        // Stub logger
        sinon.stub({ getLogger }, 'getLogger').returns({
            debug: sinon.stub(),
            info: sinon.stub(),
            error: sinon.stub(),
        } as any)

        // Stub setSmusConnectedContext
        sinon.stub({ setSmusConnectedContext }, 'setSmusConnectedContext').resolves()

        // Stub setupUserActivityMonitoring
        setupUserActivityMonitoringStub = sinon
            .stub(require('../../../awsService/sagemaker/sagemakerSpace'), 'setupUserActivityMonitoring')
            .resolves()

        // Stub isSageMaker to return true for SMUS
        sinon.stub(extensionUtilities, 'isSageMaker').returns(true)
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('activate', function () {
        it('should initialize SMUS authentication provider and call restore', async function () {
            await activate(mockExtensionContext)

            assert.ok((SmusAuthenticationProvider.fromContext as sinon.SinonStub).called)
            assert.ok(mockSmusAuthProvider.restore.called)
        })

        it('should create tree view with correct configuration', async function () {
            await activate(mockExtensionContext)

            assert.ok(createTreeViewStub.calledWith('aws.smus.rootView'))
            const createTreeViewArgs = createTreeViewStub.firstCall.args[1]
            assert.ok('treeDataProvider' in createTreeViewArgs)
        })

        it('should register all required commands', async function () {
            await activate(mockExtensionContext)

            // Check that commands are registered
            const registeredCommands = registerCommandStub.getCalls().map((call) => call.args[0])

            assert.ok(registeredCommands.includes('aws.smus.rootView.refresh'))
            assert.ok(registeredCommands.includes('aws.smus.projectView'))
            assert.ok(registeredCommands.includes('aws.smus.refreshProject'))
            assert.ok(registeredCommands.includes('aws.smus.switchProject'))
            assert.ok(registeredCommands.includes('aws.smus.stopSpace'))
            assert.ok(registeredCommands.includes('aws.smus.openRemoteConnection'))
            assert.ok(registeredCommands.includes('aws.smus.reauthenticate'))
        })

        it('should add all disposables to extension context subscriptions', async function () {
            await activate(mockExtensionContext)

            // Should have multiple subscriptions added
            assert.ok(mockExtensionContext.subscriptions.length > 0)
        })

        it('should refresh tree data provider on initialization', async function () {
            await activate(mockExtensionContext)

            assert.ok(mockTreeDataProvider.refresh.called)
        })

        it('should register DataZone client disposal', async function () {
            await activate(mockExtensionContext)

            // Find the DataZone dispose subscription
            const subscriptions = mockExtensionContext.subscriptions
            assert.ok(subscriptions.length > 0)

            // The DataZone dispose subscription should be among the subscriptions
            let dataZoneDisposeFound = false
            for (const subscription of subscriptions) {
                if (subscription && typeof subscription.dispose === 'function') {
                    // Try calling dispose and see if it calls DataZoneClient.dispose
                    const callCountBefore = dataZoneDisposeStub.callCount
                    subscription.dispose()
                    if (dataZoneDisposeStub.callCount > callCountBefore) {
                        dataZoneDisposeFound = true
                        break
                    }
                }
            }

            assert.ok(dataZoneDisposeFound, 'Should register DataZone client disposal')
        })

        describe('command handlers', function () {
            beforeEach(async function () {
                await activate(mockExtensionContext)
            })

            it('should handle aws.smus.rootView.refresh command', async function () {
                const refreshCommand = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.smus.rootView.refresh')

                assert.ok(refreshCommand)

                // Execute the command handler
                await refreshCommand.args[1]()

                assert.ok(mockTreeDataProvider.refresh.called)
            })

            it('should handle aws.smus.reauthenticate command with connection', async function () {
                const reauthCommand = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.smus.reauthenticate')

                assert.ok(reauthCommand)

                const mockConnection = {
                    id: 'test-connection',
                    type: 'sso',
                    startUrl: 'https://identitycenter.amazonaws.com/ssoins-testInstanceId',
                    ssoRegion: 'us-east-1',
                    scopes: ['datazone:domain:access'],
                    label: 'Test Connection',
                } as any

                const testWindow = getTestWindow()

                // Execute the command handler with connection
                await reauthCommand.args[1](mockConnection)

                assert.ok(mockSmusAuthProvider.reauthenticate.calledWith(mockConnection))
                assert.ok(mockTreeDataProvider.refresh.called)

                // Check that an information message was shown
                const infoMessages = testWindow.shownMessages.filter(
                    (msg) => msg.severity === SeverityLevel.Information
                )
                assert.ok(infoMessages.length > 0, 'Should show information message')
                assert.ok(infoMessages.some((msg) => msg.message.includes('Successfully reauthenticated')))
            })

            it('should handle aws.smus.reauthenticate command without connection', async function () {
                const reauthCommand = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.smus.reauthenticate')

                assert.ok(reauthCommand)

                // Execute the command handler without connection
                await reauthCommand.args[1]()

                assert.ok(mockSmusAuthProvider.reauthenticate.notCalled)
            })

            it('should handle reauthentication errors', async function () {
                const reauthCommand = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.smus.reauthenticate')

                assert.ok(reauthCommand)

                const mockConnection = {
                    id: 'test-connection',
                    type: 'sso',
                    startUrl: 'https://identitycenter.amazonaws.com/ssoins-testInstanceId',
                    ssoRegion: 'us-east-1',
                    scopes: ['datazone:domain:access'],
                    label: 'Test Connection',
                } as any
                const error = new Error('Reauthentication failed')
                mockSmusAuthProvider.reauthenticate.rejects(error)

                const testWindow = getTestWindow()

                // Execute the command handler
                await reauthCommand.args[1](mockConnection)

                // Check that an error message was shown
                const errorMessages = testWindow.shownMessages.filter((msg) => msg.severity === SeverityLevel.Error)
                assert.ok(errorMessages.length > 0, 'Should show error message')
                assert.ok(errorMessages.some((msg) => msg.message.includes('Reauthentication failed')))
            })

            it('should extract detailed error message from ToolkitError cause chain', async function () {
                const reauthCommand = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.smus.reauthenticate')

                assert.ok(reauthCommand)

                const mockConnection = {
                    id: 'test-connection',
                    type: 'sso',
                    startUrl: 'https://identitycenter.amazonaws.com/ssoins-testInstanceId',
                    ssoRegion: 'us-east-1',
                    scopes: ['datazone:domain:access'],
                    label: 'Test Connection',
                } as any

                // Create a ToolkitError with a cause chain
                const detailedError = new Error('Invalid profile - The security token is expired')
                const wrapperError = new Error('Unable to reauthenticate SageMaker Unified Studio connection.')
                ;(wrapperError as any).cause = detailedError
                mockSmusAuthProvider.reauthenticate.rejects(wrapperError)

                const testWindow = getTestWindow()

                // Execute the command handler
                await reauthCommand.args[1](mockConnection)

                // Check that the detailed error message from the cause was shown
                const errorMessages = testWindow.shownMessages.filter((msg) => msg.severity === SeverityLevel.Error)
                assert.ok(errorMessages.length > 0, 'Should show error message')
                const hasDetailedError = errorMessages.some((msg) =>
                    msg.message.includes('Invalid profile - The security token is expired')
                )
                assert.ok(hasDetailedError, 'Should show detailed error from cause chain')
            })

            it('should not show success message for IAM connection reauthentication', async function () {
                const reauthCommand = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.smus.reauthenticate')

                assert.ok(reauthCommand)

                // Create an IAM connection
                const mockIamConnection = {
                    id: 'test-iam-connection',
                    type: 'iam',
                    profileName: 'test-profile',
                    region: 'us-east-1',
                    label: 'Test IAM Connection',
                } as any

                // Stub isSmusIamConnection to return true for IAM connection
                sinon.stub(model, 'isSmusIamConnection').returns(true)

                // Mock the return value to return the connection (IAM connection handled its own message)
                mockSmusAuthProvider.reauthenticate.resolves(mockIamConnection)

                const testWindow = getTestWindow()

                // Execute the command handler
                await reauthCommand.args[1](mockIamConnection)

                assert.ok(mockSmusAuthProvider.reauthenticate.calledWith(mockIamConnection))
                assert.ok(mockTreeDataProvider.refresh.called)

                // Check that NO information message was shown (IAM handles its own)
                const infoMessages = testWindow.shownMessages.filter(
                    (msg) => msg.severity === SeverityLevel.Information
                )
                assert.ok(
                    !infoMessages.some((msg) => msg.message.includes('Successfully reauthenticated')),
                    'Should not show success message for IAM connection'
                )
            })

            it('should show success message for SSO connection reauthentication', async function () {
                const reauthCommand = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.smus.reauthenticate')

                assert.ok(reauthCommand)

                const mockSsoConnection = {
                    id: 'test-sso-connection',
                    type: 'sso',
                    startUrl: 'https://identitycenter.amazonaws.com/ssoins-testInstanceId',
                    ssoRegion: 'us-east-1',
                    scopes: ['datazone:domain:access'],
                    label: 'Test SSO Connection',
                } as any

                // Stub isSmusIamConnection to return false for SSO connection
                sinon.stub(model, 'isSmusIamConnection').returns(false)

                // Mock the return value to indicate SSO connection (returns connection object)
                mockSmusAuthProvider.reauthenticate.resolves(mockSsoConnection)

                const testWindow = getTestWindow()

                // Execute the command handler
                await reauthCommand.args[1](mockSsoConnection)

                assert.ok(mockSmusAuthProvider.reauthenticate.calledWith(mockSsoConnection))
                assert.ok(mockTreeDataProvider.refresh.called)

                // Check that an information message was shown for SSO
                const infoMessages = testWindow.shownMessages.filter(
                    (msg) => msg.severity === SeverityLevel.Information
                )
                assert.ok(infoMessages.length > 0, 'Should show information message for SSO')
                assert.ok(
                    infoMessages.some((msg) => msg.message.includes('Successfully reauthenticated')),
                    'Should show success message for SSO connection'
                )
            })

            it('should handle aws.smus.refreshProject command', async function () {
                const refreshProjectCommand = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.smus.refreshProject')

                assert.ok(refreshProjectCommand)

                // Execute the command handler
                await refreshProjectCommand.args[1]()

                // Verify that getProjectSelectNode was called and refreshNode was called on the returned node
                assert.ok(mockSmusRootNode.getProjectSelectNode.called)
                const projectNode = mockSmusRootNode.getProjectSelectNode()
                assert.ok((projectNode.refreshNode as sinon.SinonStub).called)
            })

            it('should handle aws.smus.stopSpace command with valid node', async function () {
                const stopSpaceCommand = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.smus.stopSpace')

                assert.ok(stopSpaceCommand)

                const mockSpaceNode = createMockSpaceNode()

                // Mock the stopSpace function
                const stopSpaceStub = sinon.stub()
                sinon.stub(require('../../../awsService/sagemaker/commands'), 'stopSpace').value(stopSpaceStub)

                // Execute the command handler
                await stopSpaceCommand.args[1](mockSpaceNode)

                assert.ok(
                    stopSpaceStub.calledWith(
                        mockSpaceNode.resource,
                        mockExtensionContext,
                        mockSpaceNode.resource.sageMakerClient
                    )
                )
            })

            it('should handle aws.smus.stopSpace command with invalid node', async function () {
                const stopSpaceCommand = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.smus.stopSpace')

                assert.ok(stopSpaceCommand)

                const testWindow = getTestWindow()

                // Execute the command handler with undefined node
                await stopSpaceCommand.args[1](undefined)

                // Check that a warning message was shown
                const warningMessages = testWindow.shownMessages.filter((msg) => msg.severity === SeverityLevel.Warning)
                assert.ok(warningMessages.length > 0, 'Should show warning message')
                assert.ok(warningMessages.some((msg) => msg.message.includes('Space information is being refreshed')))
            })

            it('should handle aws.smus.openRemoteConnection command with valid node', async function () {
                const openRemoteCommand = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.smus.openRemoteConnection')

                assert.ok(openRemoteCommand)

                const mockSpaceNode = createMockSpaceNode()

                // Mock the openRemoteConnect function
                const openRemoteConnectStub = sinon.stub()
                sinon
                    .stub(require('../../../awsService/sagemaker/commands'), 'openRemoteConnect')
                    .value(openRemoteConnectStub)

                // Execute the command handler
                await openRemoteCommand.args[1](mockSpaceNode)

                assert.ok(
                    openRemoteConnectStub.calledWith(
                        mockSpaceNode.resource,
                        mockExtensionContext,
                        mockSpaceNode.resource.sageMakerClient
                    )
                )
            })

            it('should handle aws.smus.openRemoteConnection command with invalid node', async function () {
                const openRemoteCommand = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.smus.openRemoteConnection')

                assert.ok(openRemoteCommand)

                const testWindow = getTestWindow()

                // Execute the command handler with undefined node
                await openRemoteCommand.args[1](undefined)

                // Check that a warning message was shown
                const warningMessages = testWindow.shownMessages.filter((msg) => msg.severity === SeverityLevel.Warning)
                assert.ok(warningMessages.length > 0, 'Should show warning message')
                assert.ok(warningMessages.some((msg) => msg.message.includes('Space information is being refreshed')))
            })
        })

        it('should propagate auth provider initialization errors', async function () {
            const error = new Error('Auth provider initialization failed')
            mockSmusAuthProvider.restore.rejects(error)

            // Should throw the error since there's no error handling in activate()
            await assert.rejects(() => activate(mockExtensionContext), /Auth provider initialization failed/)
        })

        it('should create root node with auth provider', async function () {
            await activate(mockExtensionContext)

            // Verify that SageMakerUnifiedStudioRootNode was created with the auth provider
            assert.ok(createTreeViewStub.called)
            const treeDataProvider = createTreeViewStub.firstCall.args[1].treeDataProvider
            assert.ok(treeDataProvider)
        })

        // TODO: Fix the activation test
        it.skip('should setup user activity monitoring', async function () {
            await activate(mockExtensionContext)

            assert.ok(setupUserActivityMonitoringStub.called)
        })
    })

    describe('command registration', function () {
        it('should register commands with correct names', async function () {
            await activate(mockExtensionContext)

            const expectedCommands = [
                'aws.smus.rootView.refresh',
                'aws.smus.projectView',
                'aws.smus.refreshProject',
                'aws.smus.switchProject',
                'aws.smus.stopSpace',
                'aws.smus.openRemoteConnection',
                'aws.smus.reauthenticate',
            ]

            const registeredCommands = registerCommandStub.getCalls().map((call) => call.args[0])

            for (const command of expectedCommands) {
                assert.ok(registeredCommands.includes(command), `Command ${command} should be registered`)
            }
        })

        it('should register commands that return disposables', async function () {
            await activate(mockExtensionContext)

            for (const call of registerCommandStub.getCalls()) {
                const disposable = call.returnValue
                assert.ok(disposable && typeof disposable.dispose === 'function')
            }
        })
    })

    describe('resource cleanup', function () {
        it('should dispose DataZone client on extension deactivation', async function () {
            await activate(mockExtensionContext)

            // Find and execute the DataZone dispose subscription
            const disposeSubscription = mockExtensionContext.subscriptions.find(
                (sub) => sub.dispose && sub.dispose.toString().includes('DataZoneClient.dispose')
            )

            if (disposeSubscription) {
                disposeSubscription.dispose()
                assert.ok(dataZoneDisposeStub.called)
            }
        })

        it('should add tree view to subscriptions for disposal', async function () {
            await activate(mockExtensionContext)

            assert.ok(mockExtensionContext.subscriptions.includes(mockTreeView))
        })
    })
})
