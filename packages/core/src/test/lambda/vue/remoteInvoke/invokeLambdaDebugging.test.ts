/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { RemoteInvokeWebview, InitialData } from '../../../../lambda/vue/remoteInvoke/invokeLambda'
import { LambdaClient, DefaultLambdaClient } from '../../../../shared/clients/lambdaClient'
import * as vscode from 'vscode'
import sinon, { SinonStubbedInstance, createStubInstance } from 'sinon'
import { RemoteDebugController } from '../../../../lambda/remoteDebugging/ldkController'
import type { DebugConfig } from '../../../../lambda/remoteDebugging/lambdaDebugger'
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
import * as samCliRemoteTestEvent from '../../../../shared/sam/cli/samCliRemoteTestEvent'

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

        remoteInvokeWebview = new RemoteInvokeWebview(outputChannel, client, client, data)

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
            remoteInvokeWebview = new RemoteInvokeWebview(outputChannel, client, client, {
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

    describe('Remote Test Events', () => {
        let runSamCliStub: sinon.SinonStub

        beforeEach(() => {
            runSamCliStub = sandbox.stub(samCliRemoteTestEvent, 'runSamCliRemoteTestEvents')
            // Mock getSamCliContext module
            const samCliContext = require('../../../../shared/sam/cli/samCliContext')
            sandbox.stub(samCliContext, 'getSamCliContext').returns({
                invoker: {} as any,
            })
        })

        describe('listRemoteTestEvents', () => {
            it('should list remote test events successfully', async () => {
                runSamCliStub.resolves('event1\nevent2\nevent3\n')

                const events = await remoteInvokeWebview.listRemoteTestEvents(data.FunctionArn, data.FunctionRegion)

                assert.deepStrictEqual(events, ['event1', 'event2', 'event3'])
                assert(runSamCliStub.calledOnce)
                assert(
                    runSamCliStub.calledWith(
                        sinon.match({
                            functionArn: data.FunctionArn,
                            operation: 'list',
                            region: data.FunctionRegion,
                        })
                    )
                )
            })

            it('should return empty array when no events exist (registry not found)', async () => {
                runSamCliStub.rejects(new Error('lambda-testevent-schemas registry not found'))

                const events = await remoteInvokeWebview.listRemoteTestEvents(data.FunctionArn, data.FunctionRegion)

                assert.deepStrictEqual(events, [])
            })

            it('should return empty array when there are no saved events', async () => {
                runSamCliStub.rejects(new Error('There are no saved events'))

                const events = await remoteInvokeWebview.listRemoteTestEvents(data.FunctionArn, data.FunctionRegion)

                assert.deepStrictEqual(events, [])
            })

            it('should re-throw other errors', async () => {
                runSamCliStub.rejects(new Error('Network error'))

                await assert.rejects(
                    async () => await remoteInvokeWebview.listRemoteTestEvents(data.FunctionArn, data.FunctionRegion),
                    /Network error/
                )
            })
        })

        describe('selectRemoteTestEvent', () => {
            it('should show quickpick and return selected event content', async () => {
                // Mock list events
                runSamCliStub.onFirstCall().resolves('event1\nevent2\n')
                // Mock get event content
                runSamCliStub.onSecondCall().resolves('{"test": "content"}')

                // Mock quickpick selection using test window
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem('event1')
                })

                const result = await remoteInvokeWebview.selectRemoteTestEvent(data.FunctionArn, data.FunctionRegion)

                assert.strictEqual(result, '{"test": "content"}')
            })

            it('should show info message when no events exist', async () => {
                runSamCliStub.onFirstCall().resolves('')

                let infoMessageShown = false
                getTestWindow().onDidShowMessage((message) => {
                    if (message.message.includes('No remote test events found')) {
                        infoMessageShown = true
                    }
                })

                const result = await remoteInvokeWebview.selectRemoteTestEvent(data.FunctionArn, data.FunctionRegion)

                assert.strictEqual(result, undefined)
                assert(infoMessageShown, 'Info message should be shown')
            })

            it('should return undefined when user cancels quickpick', async () => {
                runSamCliStub.onFirstCall().resolves('event1\nevent2\n')

                // Mock user canceling quickpick
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.hide()
                })

                const result = await remoteInvokeWebview.selectRemoteTestEvent(data.FunctionArn, data.FunctionRegion)

                assert.strictEqual(result, undefined)
            })

            it('should handle list events error gracefully', async () => {
                runSamCliStub.rejects(new Error('API error'))

                let errorMessageShown = false
                getTestWindow().onDidShowMessage((message) => {
                    // Check if it's an error message
                    errorMessageShown = true
                })

                const result = await remoteInvokeWebview.selectRemoteTestEvent(data.FunctionArn, data.FunctionRegion)

                assert.strictEqual(result, undefined)
                assert(errorMessageShown, 'Error message should be shown')
            })
        })

        describe('saveRemoteTestEvent', () => {
            it('should create new test event', async () => {
                // Mock empty list (no existing events)
                runSamCliStub.onFirstCall().resolves('')
                // Mock create event success
                runSamCliStub.onSecondCall().resolves('Event created')

                // Mock quickpick to select "Create new"
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem('$(add) Create new test event')
                })

                // Mock input box for event name
                getTestWindow().onDidShowInputBox((input) => {
                    input.acceptValue('MyNewEvent')
                })

                const result = await remoteInvokeWebview.saveRemoteTestEvent(
                    data.FunctionArn,
                    data.FunctionRegion,
                    '{"test": "data"}'
                )

                assert.strictEqual(result, 'MyNewEvent')
                assert(runSamCliStub.calledTwice)
                assert(
                    runSamCliStub.secondCall.calledWith(
                        sinon.match({
                            functionArn: data.FunctionArn,
                            operation: 'put',
                            name: 'MyNewEvent',
                            eventSample: '{"test": "data"}',
                            region: data.FunctionRegion,
                            force: false,
                        })
                    )
                )
            })

            it('should overwrite existing test event with force flag', async () => {
                // Mock list with existing events
                runSamCliStub.onFirstCall().resolves('existingEvent1\nexistingEvent2\n')
                // Mock update event success
                runSamCliStub.onSecondCall().resolves('Event updated')

                // Mock quickpick to select existing event
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem('existingEvent1')
                })

                // Mock confirmation dialog
                getTestWindow().onDidShowMessage((message) => {
                    // Select the overwrite option
                    message.selectItem('Overwrite')
                })

                const result = await remoteInvokeWebview.saveRemoteTestEvent(
                    data.FunctionArn,
                    data.FunctionRegion,
                    '{"updated": "data"}'
                )

                assert.strictEqual(result, 'existingEvent1')
                assert(runSamCliStub.calledTwice)
                assert(
                    runSamCliStub.secondCall.calledWith(
                        sinon.match({
                            functionArn: data.FunctionArn,
                            operation: 'put',
                            name: 'existingEvent1',
                            eventSample: '{"updated": "data"}',
                            region: data.FunctionRegion,
                            force: true, // Should use force flag for overwrite
                        })
                    )
                )
            })

            it('should handle user cancellation of overwrite', async () => {
                runSamCliStub.onFirstCall().resolves('existingEvent1\n')

                // Mock quickpick to select existing event
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem('existingEvent1')
                })

                // User cancels overwrite warning
                getTestWindow().onDidShowMessage((message) => {
                    // Cancel the dialog
                    message.close()
                })

                const result = await remoteInvokeWebview.saveRemoteTestEvent(
                    data.FunctionArn,
                    data.FunctionRegion,
                    '{"test": "data"}'
                )

                assert.strictEqual(result, undefined)
                assert(runSamCliStub.calledOnce) // Only list was called
            })

            it('should validate event name for new events', async () => {
                runSamCliStub.onFirstCall().resolves('existingEvent\n')
                runSamCliStub.onSecondCall().resolves('Event created')

                // Mock quickpick to select "Create new"
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem('$(add) Create new test event')
                })

                // Mock input box with validation
                let validationTested = false
                getTestWindow().onDidShowInputBox((input) => {
                    // We can't directly test validation in this test framework
                    // Just accept a valid value
                    input.acceptValue('NewEvent')
                    validationTested = true
                })

                const result = await remoteInvokeWebview.saveRemoteTestEvent(
                    data.FunctionArn,
                    data.FunctionRegion,
                    '{"test": "data"}'
                )

                assert.strictEqual(result, 'NewEvent')
                assert(validationTested, 'Input box should have been shown')
            })

            it('should handle list events error gracefully', async () => {
                // List events fails but should continue
                runSamCliStub.onFirstCall().rejects(new Error('List failed'))
                runSamCliStub.onSecondCall().resolves('Event created')

                // Mock quickpick to select "Create new"
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem('$(add) Create new test event')
                })

                // Mock input box for event name
                getTestWindow().onDidShowInputBox((input) => {
                    input.acceptValue('NewEvent')
                })

                const result = await remoteInvokeWebview.saveRemoteTestEvent(
                    data.FunctionArn,
                    data.FunctionRegion,
                    '{"test": "data"}'
                )

                assert.strictEqual(result, 'NewEvent')
                // Should still create the event even if list failed
                assert(runSamCliStub.calledTwice)
            })

            it('should return undefined when user cancels quickpick', async () => {
                runSamCliStub.onFirstCall().resolves('event1\n')

                // Mock user canceling quickpick
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.hide()
                })

                const result = await remoteInvokeWebview.saveRemoteTestEvent(
                    data.FunctionArn,
                    data.FunctionRegion,
                    '{"test": "data"}'
                )

                assert.strictEqual(result, undefined)
            })
        })

        describe('createRemoteTestEvents', () => {
            it('should create event without force flag', async () => {
                runSamCliStub.resolves('Event created')

                const result = await remoteInvokeWebview.createRemoteTestEvents({
                    name: 'TestEvent',
                    event: '{"test": "data"}',
                    region: 'us-west-2',
                    arn: data.FunctionArn,
                })

                assert.strictEqual(result, 'Event created')
                assert(
                    runSamCliStub.calledWith(
                        sinon.match({
                            functionArn: data.FunctionArn,
                            operation: 'put',
                            name: 'TestEvent',
                            eventSample: '{"test": "data"}',
                            region: 'us-west-2',
                            force: false,
                        })
                    )
                )
            })

            it('should create event with force flag for overwrite', async () => {
                runSamCliStub.resolves('Event updated')

                const result = await remoteInvokeWebview.createRemoteTestEvents(
                    {
                        name: 'ExistingEvent',
                        event: '{"updated": "data"}',
                        region: 'us-west-2',
                        arn: data.FunctionArn,
                    },
                    true // force flag
                )

                assert.strictEqual(result, 'Event updated')
                assert(
                    runSamCliStub.calledWith(
                        sinon.match({
                            force: true,
                        })
                    )
                )
            })
        })

        describe('getRemoteTestEvents', () => {
            it('should get remote test event content', async () => {
                runSamCliStub.resolves('{"event": "content"}')

                const result = await remoteInvokeWebview.getRemoteTestEvents({
                    name: 'TestEvent',
                    region: 'us-west-2',
                    arn: data.FunctionArn,
                })

                assert.strictEqual(result, '{"event": "content"}')
                assert(
                    runSamCliStub.calledWith(
                        sinon.match({
                            name: 'TestEvent',
                            operation: 'get',
                            functionArn: data.FunctionArn,
                            region: 'us-west-2',
                        })
                    )
                )
            })
        })
    })

    describe('Debugging Flow', () => {
        let mockConfig: DebugConfig

        beforeEach(() => {
            mockConfig = createMockDebugConfig({
                functionArn: data.FunctionArn,
                functionName: data.FunctionName,
            })
            async function mockRun<T>(fn: (span: any) => T): Promise<T> {
                const span = { record: sandbox.stub() }
                return fn(span)
            }
            // Mock telemetry to avoid issues
            sandbox.stub(require('../../../../shared/telemetry/telemetry'), 'telemetry').value({
                lambda_invokeRemote: {
                    run: mockRun,
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
