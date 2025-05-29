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

        // Create the manager
        cursorUpdateManager = new CursorUpdateManager(languageClient)
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

    it('should send cursor update requests at intervals', async () => {
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

        // Manually call the interval function
        await (cursorUpdateManager as any).sendCursorUpdate()

        // Verify the request was sent
        assert.ok(sendRequestStub.called)
        assert.strictEqual(sendRequestStub.firstCall.args[0], 'aws/inlineCompletionWithReferences')
        assert.deepStrictEqual(sendRequestStub.firstCall.args[1], {
            textDocument: { uri },
            position: { line: 1, character: 2 },
            context: { triggerKind: vscode.InlineCompletionTriggerKind.Automatic },
        })
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
})
