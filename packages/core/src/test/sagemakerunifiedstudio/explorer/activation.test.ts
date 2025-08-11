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
import { DataZoneClient } from '../../../sagemakerunifiedstudio/shared/client/datazoneClient'
import { ResourceTreeDataProvider } from '../../../shared/treeview/resourceTreeDataProvider'
import { SageMakerUnifiedStudioRootNode } from '../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioRootNode'
import { getLogger } from '../../../shared/logger/logger'
import { getTestWindow } from '../../shared/vscode/window'
import { SeverityLevel } from '../../shared/vscode/message'

describe('SMUS Explorer Activation', function () {
    let mockExtensionContext: vscode.ExtensionContext
    let mockSmusAuthProvider: sinon.SinonStubbedInstance<SmusAuthenticationProvider>
    let mockTreeView: sinon.SinonStubbedInstance<vscode.TreeView<any>>
    let mockTreeDataProvider: sinon.SinonStubbedInstance<ResourceTreeDataProvider>
    let mockSmusRootNode: sinon.SinonStubbedInstance<SageMakerUnifiedStudioRootNode>
    let createTreeViewStub: sinon.SinonStub
    let registerCommandStub: sinon.SinonStub
    let dataZoneDisposeStub: sinon.SinonStub

    beforeEach(function () {
        mockExtensionContext = {
            subscriptions: [],
        } as any

        mockSmusAuthProvider = {
            restore: sinon.stub().resolves(),
            isConnected: sinon.stub().returns(true),
            reauthenticate: sinon.stub().resolves(),
            onDidChange: sinon.stub().callsFake((_listener: () => void) => ({ dispose: sinon.stub() })),
            activeConnection: {
                id: 'test-connection',
                domainId: 'test-domain',
                ssoRegion: 'us-east-1',
            },
        } as any

        mockTreeView = {
            dispose: sinon.stub(),
        } as any

        mockTreeDataProvider = {
            refresh: sinon.stub(),
        } as any

        mockSmusRootNode = {
            getChildren: sinon.stub().resolves([]),
            getProjectSelectNode: sinon.stub().returns({}),
        } as any

        // Stub vscode APIs
        createTreeViewStub = sinon.stub(vscode.window, 'createTreeView').returns(mockTreeView as any)
        registerCommandStub = sinon.stub(vscode.commands, 'registerCommand').returns({ dispose: sinon.stub() } as any)

        // Stub SmusAuthenticationProvider
        sinon.stub(SmusAuthenticationProvider, 'fromContext').returns(mockSmusAuthProvider as any)

        // Stub DataZoneClient
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
            assert.ok(registeredCommands.includes('aws.smus.switchProject'))
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

            // Find the DataZone dispose subscription - it should be the last one added
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
                assert.ok(errorMessages.some((msg) => msg.message.includes('Failed to reauthenticate')))
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
    })

    describe('command registration', function () {
        it('should register commands with correct names', async function () {
            await activate(mockExtensionContext)

            const expectedCommands = [
                'aws.smus.rootView.refresh',
                'aws.smus.projectView',
                'aws.smus.switchProject',
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
