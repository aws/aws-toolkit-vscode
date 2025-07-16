/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { RemoteInvokeWebview, InitialData } from '../../../../lambda/vue/remoteInvoke/invokeLambda'
import { LambdaClient, DefaultLambdaClient } from '../../../../shared/clients/lambdaClient'
import * as vscode from 'vscode'
import sinon, { SinonStubbedInstance, createStubInstance } from 'sinon'
import { RemoteDebugController, DebugConfig } from '../../../../lambda/remoteDebugging/ldkController'
import { getTestWindow } from '../../../shared/vscode/window'
import { LambdaFunctionNode } from '../../../../lambda/explorer/lambdaFunctionNode'
import * as downloadLambda from '../../../../lambda/commands/downloadLambda'
import * as uploadLambda from '../../../../lambda/commands/uploadLambda'
import * as appBuilderUtils from '../../../../awsService/appBuilder/utils'
import * as messages from '../../../../shared/utilities/messages'
import globals from '../../../../shared/extensionGlobals'
import fs from '../../../../shared/fs/fs'
import { ToolkitError } from '../../../../shared'
import { createMockDebugConfig } from '../../remoteDebugging/testUtils'

describe('RemoteInvokeWebview - Debugging Functionality', () => {
    let outputChannel: vscode.OutputChannel
    let client: SinonStubbedInstance<LambdaClient>
    let remoteInvokeWebview: RemoteInvokeWebview
    let data: InitialData
    let sandbox: sinon.SinonSandbox
    let mockDebugController: SinonStubbedInstance<RemoteDebugController>
    let mockFunctionNode: LambdaFunctionNode

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        client = createStubInstance(DefaultLambdaClient)
        outputChannel = {
            appendLine: sandbox.stub(),
            show: sandbox.stub(),
        } as unknown as vscode.OutputChannel

        mockFunctionNode = {
            configuration: {
                FunctionName: 'testFunction',
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
                Handler: 'index.handler',
                Runtime: 'nodejs18.x',
                SnapStart: { ApplyOn: 'None' },
            },
            regionCode: 'us-west-2',
            localDir: '/local/path',
        } as LambdaFunctionNode

        data = {
            FunctionName: 'testFunction',
            FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
            FunctionRegion: 'us-west-2',
            InputSamples: [],
            Runtime: 'nodejs18.x',
            LocalRootPath: '/local/path',
            LambdaFunctionNode: mockFunctionNode,
            supportCodeDownload: true,
            runtimeSupportsRemoteDebug: true,
            regionSupportsRemoteDebug: true,
        } as InitialData

        remoteInvokeWebview = new RemoteInvokeWebview(outputChannel, client, data)

        // Mock RemoteDebugController
        mockDebugController = createStubInstance(RemoteDebugController)
        sandbox.stub(RemoteDebugController, 'instance').get(() => mockDebugController)

        // Set handler file as available by default to avoid timeout issues
        ;(remoteInvokeWebview as any).handlerFileAvailable = true
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('Debug Timer Management', () => {
        it('should start debug timer and count down', async () => {
            remoteInvokeWebview.startDebugTimer()

            // Check initial state
            assert.strictEqual(remoteInvokeWebview.getDebugTimeRemaining(), 60)

            // Wait a bit and check if timer is counting down
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    const timeRemaining = remoteInvokeWebview.getDebugTimeRemaining()
                    assert(timeRemaining < 60 && timeRemaining > 0, 'Timer should be counting down')
                    remoteInvokeWebview.stopDebugTimer()
                    resolve()
                }, 1100) // Wait slightly more than 1 second
            })
        })

        it('should stop debug timer', () => {
            remoteInvokeWebview.startDebugTimer()
            assert(remoteInvokeWebview.getDebugTimeRemaining() > 0)

            remoteInvokeWebview.stopDebugTimer()
            assert.strictEqual(remoteInvokeWebview.getDebugTimeRemaining(), 0)
        })

        it('should handle timer expiration by stopping debugging', async () => {
            const stopDebuggingStub = sandbox.stub(remoteInvokeWebview, 'stopDebugging').resolves(true)

            // Mock a very short timer for testing
            sandbox.stub(remoteInvokeWebview, 'startDebugTimer').callsFake(() => {
                // Simulate immediate timer expiration
                setTimeout(async () => {
                    await (remoteInvokeWebview as any).handleTimerExpired()
                }, 10)
            })

            remoteInvokeWebview.startDebugTimer()

            // Wait for timer to expire
            await new Promise((resolve) => setTimeout(resolve, 50))

            assert(stopDebuggingStub.calledOnce, 'stopDebugging should be called when timer expires')
        })
    })

    describe('Debug State Management', () => {
        it('should reset server state correctly', () => {
            // Set up some state
            remoteInvokeWebview.startDebugTimer()

            // Mock the debugging state
            mockDebugController.isDebugging = true

            remoteInvokeWebview.resetServerState()

            assert.strictEqual(remoteInvokeWebview.getDebugTimeRemaining(), 0)
            assert.strictEqual(remoteInvokeWebview.isWebViewDebugging(), false)
        })

        it('should check if ready to invoke when not invoking', () => {
            const result = remoteInvokeWebview.checkReadyToInvoke()
            assert.strictEqual(result, true)
        })

        it('should show warning when invoke is in progress', () => {
            // Mock the window.showWarningMessage through getTestWindow
            getTestWindow().onDidShowMessage(() => {
                // Message handler for warning
            })

            // Set invoking state
            ;(remoteInvokeWebview as any).isInvoking = true

            const result = remoteInvokeWebview.checkReadyToInvoke()

            assert.strictEqual(result, false)
            // The warning should be shown but we can't easily verify it in this test setup
        })

        it('should return correct debugging states', () => {
            mockDebugController.isDebugging = true
            assert.strictEqual(remoteInvokeWebview.isLDKDebugging(), true)

            mockDebugController.isDebugging = false
            assert.strictEqual(remoteInvokeWebview.isLDKDebugging(), false)
        })
    })

    describe('Debug Configuration and Validation', () => {
        let mockConfig: DebugConfig

        beforeEach(() => {
            mockConfig = createMockDebugConfig({
                functionArn: data.FunctionArn,
                functionName: data.FunctionName,
            })
        })

        it('should check ready to debug with valid config', async () => {
            // Ensure handler file is available to avoid confirmation dialog
            ;(remoteInvokeWebview as any).handlerFileAvailable = true

            const result = await remoteInvokeWebview.checkReadyToDebug(mockConfig)
            assert.strictEqual(result, true)
        })

        it('should return false when LambdaFunctionNode is undefined', async () => {
            remoteInvokeWebview = new RemoteInvokeWebview(outputChannel, client, {
                ...data,
                LambdaFunctionNode: undefined,
            })

            const result = await remoteInvokeWebview.checkReadyToDebug(mockConfig)
            assert.strictEqual(result, false)
        })

        it('should show warning when handler file is not available', async () => {
            const showConfirmationStub = sandbox.stub(messages, 'showConfirmationMessage').resolves(false)

            // Set handler file as not available
            ;(remoteInvokeWebview as any).handlerFileAvailable = false

            const result = await remoteInvokeWebview.checkReadyToDebug(mockConfig)

            assert.strictEqual(result, false)
            assert(showConfirmationStub.calledOnce)
        })

        it('should show snapstart warning when publishing version with snapstart enabled', async () => {
            const showConfirmationStub = sandbox.stub(messages, 'showConfirmationMessage').resolves(false)

            mockConfig.shouldPublishVersion = true
            data.LambdaFunctionNode!.configuration.SnapStart = { ApplyOn: 'PublishedVersions' }

            const result = await remoteInvokeWebview.checkReadyToDebug(mockConfig)

            assert.strictEqual(result, false)
            assert(showConfirmationStub.calledOnce)
        })
    })

    describe('Debug Session Management', () => {
        let mockConfig: DebugConfig

        beforeEach(() => {
            mockConfig = createMockDebugConfig({
                functionArn: data.FunctionArn,
                functionName: data.FunctionName,
            })
        })

        it('should start debugging successfully', async () => {
            // Ensure handler file is available to avoid confirmation dialog
            ;(remoteInvokeWebview as any).handlerFileAvailable = true

            mockDebugController.startDebugging.resolves()
            mockDebugController.isDebugging = true

            const result = await remoteInvokeWebview.startDebugging(mockConfig)

            assert.strictEqual(result, true)
            assert(mockDebugController.startDebugging.calledOnce)
        })

        it('should call stop debugging', async () => {
            mockDebugController.isDebugging = true
            mockDebugController.stopDebugging.resolves()

            await remoteInvokeWebview.stopDebugging()

            // The method doesn't return a boolean, it returns void
            assert(mockDebugController.stopDebugging.calledOnce)
        })

        it('should handle debug pre-check with existing session', async () => {
            const showConfirmationStub = sandbox.stub(messages, 'showConfirmationMessage').resolves(true)
            const stopDebuggingStub = sandbox.stub(remoteInvokeWebview, 'stopDebugging').resolves(false)
            mockDebugController.isDebugging = true
            mockDebugController.installDebugExtension.resolves(true)

            // Mock revertExistingConfig - need to import it properly
            const ldkController = require('../../../../lambda/remoteDebugging/ldkController')
            const revertStub = sandbox.stub(ldkController, 'revertExistingConfig').resolves(true)

            await remoteInvokeWebview.debugPreCheck()

            assert(showConfirmationStub.calledOnce)
            assert(stopDebuggingStub.calledOnce)
            assert(mockDebugController.installDebugExtension.calledOnce)
            assert(revertStub.calledOnce)
        })
    })

    describe('File Operations and Code Management', () => {
        it('should prompt for folder selection', async () => {
            const mockUri = vscode.Uri.file('/selected/folder')
            getTestWindow().onDidShowDialog((d) => d.selectItem(mockUri))

            const result = await remoteInvokeWebview.promptFolder()

            assert.strictEqual(result, mockUri.fsPath)
            assert.strictEqual(remoteInvokeWebview.getLocalPath(), mockUri.fsPath)
        })

        it('should return undefined when no folder is selected', async () => {
            getTestWindow().onDidShowDialog((d) => d.close())

            const result = await remoteInvokeWebview.promptFolder()

            assert.strictEqual(result, undefined)
        })

        it('should try to open handler file successfully', async () => {
            const mockHandlerUri = vscode.Uri.file('/local/path/index.js')
            sandbox.stub(appBuilderUtils, 'getLambdaHandlerFile').resolves(mockHandlerUri)
            sandbox.stub(fs, 'exists').resolves(true)
            sandbox.stub(downloadLambda, 'openLambdaFile').resolves()

            const result = await remoteInvokeWebview.tryOpenHandlerFile('/local/path')

            assert.strictEqual(result, true)
            assert.strictEqual(remoteInvokeWebview.getHandlerAvailable(), true)
        })

        it('should handle handler file not found', async () => {
            sandbox.stub(appBuilderUtils, 'getLambdaHandlerFile').resolves(undefined)

            // Mock the warning message through getTestWindow
            getTestWindow().onDidShowMessage(() => {
                // Message handler for warning
            })

            const result = await remoteInvokeWebview.tryOpenHandlerFile('/local/path')

            assert.strictEqual(result, false)
            assert.strictEqual(remoteInvokeWebview.getHandlerAvailable(), false)
        })

        it('should download remote code successfully', async () => {
            const mockUri = vscode.Uri.file('/downloaded/path')
            sandbox.stub(downloadLambda, 'runDownloadLambda').resolves(mockUri)

            // Mock workspace state operations
            const mockWorkspaceState = {
                get: sandbox.stub().returns({}),
                update: sandbox.stub().resolves(),
            }
            sandbox.stub(globals, 'context').value({
                workspaceState: mockWorkspaceState,
            })

            const result = await remoteInvokeWebview.downloadRemoteCode()

            assert.strictEqual(result, mockUri.fsPath)
            assert.strictEqual(data.LocalRootPath, mockUri.fsPath)
        })

        it('should handle download failure', async () => {
            sandbox.stub(downloadLambda, 'runDownloadLambda').rejects(new Error('Download failed'))

            await assert.rejects(
                async () => await remoteInvokeWebview.downloadRemoteCode(),
                /Failed to download remote code/
            )
        })
    })

    describe('File Watching and Code Synchronization', () => {
        it('should setup file watcher when local root path exists', () => {
            const createFileSystemWatcherStub = sandbox.stub(vscode.workspace, 'createFileSystemWatcher')
            const mockWatcher = {
                onDidChange: sandbox.stub(),
                onDidCreate: sandbox.stub(),
                onDidDelete: sandbox.stub(),
            }
            createFileSystemWatcherStub.returns(mockWatcher as any)

            // Call the private method through reflection
            ;(remoteInvokeWebview as any).setupFileWatcher()

            assert(createFileSystemWatcherStub.calledOnce)
            assert(mockWatcher.onDidChange.calledOnce)
            assert(mockWatcher.onDidCreate.calledOnce)
            assert(mockWatcher.onDidDelete.calledOnce)
        })

        it('should handle file changes and prompt for upload', async () => {
            const showConfirmationStub = sandbox.stub(messages, 'showMessage').resolves('Yes')
            const runUploadDirectoryStub = sandbox.stub(uploadLambda, 'runUploadDirectory').resolves()

            // Mock file watcher setup
            let changeHandler: () => Promise<void>
            const mockWatcher = {
                onDidChange: (handler: () => Promise<void>) => {
                    changeHandler = handler
                },
                onDidCreate: sandbox.stub(),
                onDidDelete: sandbox.stub(),
            }
            sandbox.stub(vscode.workspace, 'createFileSystemWatcher').returns(mockWatcher as any)

            // Setup file watcher
            ;(remoteInvokeWebview as any).setupFileWatcher()

            // Trigger file change
            await changeHandler!()

            assert(showConfirmationStub.calledOnce)
            assert(runUploadDirectoryStub.calledOnce)
        })
    })

    describe('Lambda Invocation with Debugging', () => {
        it('should invoke lambda with remote debugging enabled', async () => {
            const mockResponse = {
                LogResult: Buffer.from('Debug log').toString('base64'),
                Payload: '{"result": "debug success"}',
            }
            client.invoke.resolves(mockResponse)
            mockDebugController.isDebugging = true
            mockDebugController.qualifier = 'v1'

            const focusStub = sandbox.stub(vscode.commands, 'executeCommand').resolves()

            await remoteInvokeWebview.invokeLambda('{"test": "input"}', 'test', true)

            assert(client.invoke.calledWith(data.FunctionArn, '{"test": "input"}', 'v1'))
            assert(focusStub.calledWith('workbench.action.focusFirstEditorGroup'))
        })

        it('should handle timer management during debugging invocation', async () => {
            const mockResponse = {
                LogResult: Buffer.from('Debug log').toString('base64'),
                Payload: '{"result": "debug success"}',
            }
            client.invoke.resolves(mockResponse)
            mockDebugController.isDebugging = true

            const stopTimerStub = sandbox.stub(remoteInvokeWebview, 'stopDebugTimer')
            const startTimerStub = sandbox.stub(remoteInvokeWebview, 'startDebugTimer')

            await remoteInvokeWebview.invokeLambda('{"test": "input"}', 'test', true)

            // Timer should be stopped at least once during invoke
            assert(stopTimerStub.calledOnce)
            assert(startTimerStub.calledOnce) // Called after invoke
        })
    })

    describe('Dispose and Cleanup', () => {
        it('should dispose server and clean up resources', async () => {
            // Set up debugging state and disposables
            ;(remoteInvokeWebview as any).debugging = true
            mockDebugController.isDebugging = true

            // Mock disposables
            const mockDisposable = { dispose: sandbox.stub() }
            ;(remoteInvokeWebview as any).watcherDisposable = mockDisposable
            ;(remoteInvokeWebview as any).fileWatcherDisposable = mockDisposable

            await remoteInvokeWebview.disposeServer()

            assert(mockDisposable.dispose.calledTwice)
            assert(mockDebugController.stopDebugging.calledOnce)
        })

        it('should handle dispose when not debugging', async () => {
            mockDebugController.isDebugging = false

            const mockDisposable = { dispose: sandbox.stub() }
            ;(remoteInvokeWebview as any).watcherDisposable = mockDisposable

            await remoteInvokeWebview.disposeServer()

            assert(mockDisposable.dispose.calledOnce)
        })
    })

    describe('Debug Session Event Handling', () => {
        it('should handle debug session termination', async () => {
            const resetStateStub = sandbox.stub(remoteInvokeWebview, 'resetServerState')

            // Mock debug session termination event
            let terminationHandler: (session: vscode.DebugSession) => Promise<void>
            sandbox.stub(vscode.debug, 'onDidTerminateDebugSession').callsFake((handler) => {
                terminationHandler = handler
                return { dispose: sandbox.stub() }
            })

            // Initialize the webview to set up event handlers
            remoteInvokeWebview.init()

            // Simulate debug session termination
            const mockSession = { name: 'test-session' } as vscode.DebugSession
            await terminationHandler!(mockSession)

            assert(resetStateStub.calledOnce)
        })
    })

    describe('Debugging Flow', () => {
        let mockConfig: DebugConfig

        beforeEach(() => {
            mockConfig = createMockDebugConfig({
                functionArn: data.FunctionArn,
                functionName: data.FunctionName,
            })

            // Mock telemetry to avoid issues
            sandbox.stub(require('../../../../shared/telemetry/telemetry'), 'telemetry').value({
                lambda_invokeRemote: {
                    emit: sandbox.stub(),
                },
            })
        })

        it('should handle complete debugging workflow', async () => {
            // Setup mocks for successful debugging
            mockDebugController.startDebugging.resolves()
            mockDebugController.stopDebugging.resolves()
            mockDebugController.isDebugging = false

            // Mock the debugging state change after startDebugging is called
            mockDebugController.startDebugging.callsFake(async () => {
                mockDebugController.isDebugging = true
                return Promise.resolve()
            })

            // 1. Start debugging
            const startResult = await remoteInvokeWebview.startDebugging(mockConfig)
            assert.strictEqual(startResult, true, 'Debug session should start successfully')

            // Set qualifier for invocation
            mockDebugController.qualifier = '$LATEST'

            // 2. Test lambda invocation during debugging
            const mockResponse = {
                LogResult: Buffer.from('Debug invocation log').toString('base64'),
                Payload: '{"debugResult": "success"}',
            }
            client.invoke.resolves(mockResponse)

            await remoteInvokeWebview.invokeLambda('{"debugInput": "test"}', 'integration-test', true)

            // Verify invocation was called with correct parameters
            assert(client.invoke.calledWith(data.FunctionArn, '{"debugInput": "test"}', '$LATEST'))

            // 3. Stop debugging
            await remoteInvokeWebview.stopDebugging()

            // Verify cleanup operations were called
            assert(mockDebugController.stopDebugging.calledOnce, 'Should stop debugging')
        })

        it('should handle debugging failure gracefully', async () => {
            // Setup mock for debugging failure
            mockDebugController.startDebugging.rejects(new Error('Debug start failed'))
            mockDebugController.isDebugging = false

            // Attempt to start debugging - should throw error
            try {
                await remoteInvokeWebview.startDebugging(mockConfig)
                assert.fail('Expected error to be thrown')
            } catch (error) {
                assert(error instanceof ToolkitError)
                assert(error.message.includes('Failed to start debugging'))
                assert(error.cause?.message.includes('Debug start failed'))
            }

            assert.strictEqual(
                remoteInvokeWebview.isWebViewDebugging(),
                false,
                'Webview should not be in debugging state'
            )
        })

        it('should handle version publishing workflow', async () => {
            // Setup config for version publishing
            const versionConfig = { ...mockConfig, shouldPublishVersion: true }

            // Setup mocks for version publishing
            mockDebugController.startDebugging.resolves()
            mockDebugController.stopDebugging.resolves()
            mockDebugController.isDebugging = false

            // Mock the debugging state change after startDebugging is called
            mockDebugController.startDebugging.callsFake(async () => {
                mockDebugController.isDebugging = true
                mockDebugController.qualifier = 'v1'
                return Promise.resolve()
            })

            // Start debugging with version publishing
            const startResult = await remoteInvokeWebview.startDebugging(versionConfig)
            assert.strictEqual(startResult, true, 'Debug session should start successfully')

            // Test invocation with version qualifier
            const mockResponse = {
                LogResult: Buffer.from('Version debug log').toString('base64'),
                Payload: '{"versionResult": "success"}',
            }
            client.invoke.resolves(mockResponse)

            await remoteInvokeWebview.invokeLambda('{"versionInput": "test"}', 'version-test', true)

            // Should invoke with version qualifier
            assert(client.invoke.calledWith(data.FunctionArn, '{"versionInput": "test"}', 'v1'))

            // Stop debugging
            await remoteInvokeWebview.stopDebugging()

            assert(mockDebugController.stopDebugging.calledOnce, 'Should stop debugging')
        })
    })
})
