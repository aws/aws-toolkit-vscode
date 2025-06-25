/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { LanguageClient } from 'vscode-languageclient'
import { CursorUpdateManager } from '../../../../src/app/inline/cursorUpdateManager'
import { globals } from 'aws-core-vscode/shared'
import assert from 'assert'
import { AmazonQInlineCompletionItemProvider } from '../../../../src/app/inline/completion'

describe('CursorUpdateManager', () => {
    let cursorUpdateManager: CursorUpdateManager
    let languageClient: LanguageClient
    let clock: sinon.SinonFakeTimers
    let sendRequestStub: sinon.SinonStub
    let setIntervalStub: sinon.SinonStub
    let clearIntervalStub: sinon.SinonStub
    let dateNowStub: sinon.SinonStub

    beforeEach(() => {
        // Create stubs for all the methods we'll use
        sendRequestStub = sinon.stub()
        sendRequestStub.resolves({}) // Default resolve value

        languageClient = {
            sendRequest: sendRequestStub,
        } as unknown as LanguageClient

        // Setup clock stubs
        clock = sinon.useFakeTimers()
        setIntervalStub = sinon.stub(globals.clock, 'setInterval').returns(1 as unknown as NodeJS.Timeout)
        clearIntervalStub = sinon.stub(globals.clock, 'clearInterval')
        dateNowStub = sinon.stub(globals.clock.Date, 'now').returns(1000)

        // Create the manager with a mock recommendation service
        const mockInlineCompletionProvider = {
            provideInlineCompletionItems: sinon.stub().resolves([]),
        } as unknown as AmazonQInlineCompletionItemProvider
        cursorUpdateManager = new CursorUpdateManager(languageClient, mockInlineCompletionProvider)
    })

    afterEach(() => {
        sinon.restore()
        clock.restore()
    })

    it('should initialize with default values', () => {
        assert.strictEqual((cursorUpdateManager as any).updateIntervalMs, 250)
        assert.strictEqual((cursorUpdateManager as any).isActive, false)
    })

    it('should start tracking cursor positions', async () => {
        // Setup the server response for configuration
        sendRequestStub.resolves({ intervalMs: 500 })

        await cursorUpdateManager.start()

        // Verify the configuration was requested
        assert.ok(sendRequestStub.called)
        assert.strictEqual(sendRequestStub.firstCall.args[0], 'aws/getConfigurationFromServer')

        // Verify the interval was updated and timer was started
        assert.strictEqual((cursorUpdateManager as any).updateIntervalMs, 500)
        assert.strictEqual((cursorUpdateManager as any).isActive, true)
        assert.ok(setIntervalStub.called)
    })

    it('should use default interval if server config is invalid', async () => {
        // Setup the server response with invalid config
        sendRequestStub.resolves(undefined)

        await cursorUpdateManager.start()

        // Verify the interval was not updated but timer was started
        assert.strictEqual((cursorUpdateManager as any).updateIntervalMs, 250)
        assert.strictEqual((cursorUpdateManager as any).isActive, true)
        assert.ok(setIntervalStub.called)
    })

    it('should handle server configuration errors', async () => {
        // Setup the server to throw an error
        sendRequestStub.onFirstCall().rejects(new Error('Server error'))
        sendRequestStub.onSecondCall().resolves({})

        await cursorUpdateManager.start()

        // Verify we still start with default values
        assert.strictEqual((cursorUpdateManager as any).updateIntervalMs, 250)
        assert.strictEqual((cursorUpdateManager as any).isActive, true)
        assert.ok(setIntervalStub.called)
    })

    it('should update cursor position', () => {
        const position = new vscode.Position(1, 2)
        const uri = 'file:///test.ts'

        cursorUpdateManager.updatePosition(position, uri)

        assert.deepStrictEqual((cursorUpdateManager as any).lastPosition, position)
        assert.strictEqual((cursorUpdateManager as any).lastDocumentUri, uri)
    })

    it('should record completion request time', () => {
        dateNowStub.returns(2000)
        cursorUpdateManager.recordCompletionRequest()
        assert.strictEqual((cursorUpdateManager as any).lastRequestTime, 2000)
    })

    it('should stop tracking and clean up resources', () => {
        // First start the manager
        ;(cursorUpdateManager as any).isActive = true as boolean
        ;(cursorUpdateManager as any).updateTimer = 123

        cursorUpdateManager.stop()

        assert.strictEqual((cursorUpdateManager as any).isActive, false)
        assert.ok(clearIntervalStub.called)
        assert.strictEqual(clearIntervalStub.firstCall.args[0], 123)
    })

    it('should dispose resources', () => {
        const stopSpy = sinon.spy(cursorUpdateManager, 'stop')

        cursorUpdateManager.dispose()

        assert.ok(stopSpy.called)
    })

    it('should send cursor update requests at intervals', () => {
        // Setup test data
        const position = new vscode.Position(1, 2)
        const uri = 'file:///test.ts'
        cursorUpdateManager.updatePosition(position, uri)

        // Mock the active editor
        const mockEditor = {
            document: {
                uri: { toString: () => uri },
            },
        }
        sinon.stub(vscode.window, 'activeTextEditor').get(() => mockEditor as any)

        // Create a mock cancellation token source
        const mockCancellationTokenSource = {
            token: {} as vscode.CancellationToken,
            dispose: sinon.stub(),
        }
        sinon.stub(cursorUpdateManager as any, 'createCancellationTokenSource').returns(mockCancellationTokenSource)

        // Mock the provideInlineCompletionItems method with a proper stub
        const provideStub = sinon.stub().resolves([])
        ;(cursorUpdateManager as any).inlineCompletionProvider = {
            provideInlineCompletionItems: provideStub,
        }

        // Start the manager - we're not awaiting this since we're just setting up the test
        cursorUpdateManager.start()

        // Reset the sendRequestStub to clear the call from start()
        sendRequestStub.resetHistory()

        // Make sure lastSentPosition is different from lastPosition to trigger an update
        ;(cursorUpdateManager as any).lastSentPosition = new vscode.Position(0, 0)

        // Manually call the interval function
        ;(cursorUpdateManager as any).sendCursorUpdate()

        // Verify the provider was called
        assert.strictEqual(provideStub.called, true, 'provideInlineCompletionItems should have been called')
    })

    it('should not send cursor update if a regular request was made recently', async () => {
        // Setup test data
        const position = new vscode.Position(1, 2)
        const uri = 'file:///test.ts'
        cursorUpdateManager.updatePosition(position, uri)

        // Mock the active editor
        const mockEditor = {
            document: {
                uri: { toString: () => uri },
            },
        }
        sinon.stub(vscode.window, 'activeTextEditor').get(() => mockEditor as any)

        // Start the manager
        await cursorUpdateManager.start()

        // Reset the sendRequestStub to clear the call from start()
        sendRequestStub.resetHistory()

        // Record a recent completion request
        dateNowStub.returns(1000)
        cursorUpdateManager.recordCompletionRequest()

        // Set current time to be within the interval
        dateNowStub.returns(1100) // Only 100ms after the request

        // Manually call the interval function
        await (cursorUpdateManager as any).sendCursorUpdate()

        // Verify no request was sent
        assert.strictEqual(sendRequestStub.called, false)
    })

    it.only('should not send cursor update if position has not changed since last update', async () => {
        // Setup test data
        const position = new vscode.Position(1, 2)
        const uri = 'file:///test.ts'
        cursorUpdateManager.updatePosition(position, uri)

        // Mock the active editor
        const mockEditor = {
            document: {
                uri: { toString: () => uri },
            },
        }
        sinon.stub(vscode.window, 'activeTextEditor').get(() => mockEditor as any)

        // Create a mock cancellation token source
        const mockCancellationTokenSource = {
            token: {} as vscode.CancellationToken,
            dispose: sinon.stub(),
        }
        sinon.stub(cursorUpdateManager as any, 'createCancellationTokenSource').returns(mockCancellationTokenSource)

        // Mock the provideInlineCompletionItems method
        const provideStub = sinon.stub().resolves([])
        ;(cursorUpdateManager as any).inlineCompletionProvider = {
            provideInlineCompletionItems: provideStub,
        }

        // Start the manager
        await cursorUpdateManager.start()

        // Set lastSentPosition to undefined to ensure first update is sent
        ;(cursorUpdateManager as any).lastSentPosition = undefined

        // First call to sendCursorUpdate - should send update
        await (cursorUpdateManager as any).sendCursorUpdate()

        // Verify the provider was called once
        assert.strictEqual(provideStub.callCount, 1, 'First update should be sent')

        // Reset the stub to clear the call history
        provideStub.resetHistory()

        // Second call to sendCursorUpdate without changing position - should NOT send update
        await (cursorUpdateManager as any).sendCursorUpdate()

        // Verify the provider was NOT called again
        assert.strictEqual(provideStub.callCount, 0, 'No update should be sent when position has not changed')

        // Now change the position
        const newPosition = new vscode.Position(1, 3)
        cursorUpdateManager.updatePosition(newPosition, uri)

        // Third call to sendCursorUpdate with changed position - should send update
        await (cursorUpdateManager as any).sendCursorUpdate()

        // Verify the provider was called again
        assert.strictEqual(provideStub.callCount, 1, 'Update should be sent when position has changed')
    })
})
