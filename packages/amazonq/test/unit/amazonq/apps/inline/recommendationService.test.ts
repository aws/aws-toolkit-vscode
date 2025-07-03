/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { LanguageClient } from 'vscode-languageclient'
import { Position, CancellationToken, InlineCompletionItem, InlineCompletionTriggerKind } from 'vscode'
import assert from 'assert'
import { RecommendationService } from '../../../../../src/app/inline/recommendationService'
import { SessionManager } from '../../../../../src/app/inline/sessionManager'
import { createMockDocument } from 'aws-core-vscode/test'
import { LineTracker } from '../../../../../src/app/inline/stateTracker/lineTracker'
import { InlineGeneratingMessage } from '../../../../../src/app/inline/inlineGeneratingMessage'
// Import CursorUpdateManager directly instead of the interface
import { CursorUpdateManager } from '../../../../../src/app/inline/cursorUpdateManager'
import { CodeWhispererStatusBarManager } from 'aws-core-vscode/codewhisperer'
import { globals } from 'aws-core-vscode/shared'

describe('RecommendationService', () => {
    let languageClient: LanguageClient
    let sendRequestStub: sinon.SinonStub
    let sandbox: sinon.SinonSandbox
    let sessionManager: SessionManager
    let lineTracker: LineTracker
    let activeStateController: InlineGeneratingMessage
    let service: RecommendationService
    let cursorUpdateManager: CursorUpdateManager
    let statusBarStub: any
    let clockStub: sinon.SinonFakeTimers
    const mockDocument = createMockDocument()
    const mockPosition = { line: 0, character: 0 } as Position
    const mockContext = { triggerKind: InlineCompletionTriggerKind.Automatic, selectedCompletionInfo: undefined }
    const mockToken = { isCancellationRequested: false } as CancellationToken
    const mockInlineCompletionItemOne = {
        insertText: 'ItemOne',
    } as InlineCompletionItem

    const mockInlineCompletionItemTwo = {
        insertText: 'ItemTwo',
    } as InlineCompletionItem
    const mockPartialResultToken = 'some-random-token'

    beforeEach(async () => {
        sandbox = sinon.createSandbox()

        // Create a fake clock for testing time-based functionality
        clockStub = sandbox.useFakeTimers({
            now: 1000,
            shouldAdvanceTime: true,
        })

        // Stub globals.clock
        sandbox.stub(globals, 'clock').value({
            Date: {
                now: () => clockStub.now,
            },
            setTimeout: clockStub.setTimeout.bind(clockStub),
            clearTimeout: clockStub.clearTimeout.bind(clockStub),
            setInterval: clockStub.setInterval.bind(clockStub),
            clearInterval: clockStub.clearInterval.bind(clockStub),
        })

        sendRequestStub = sandbox.stub()

        languageClient = {
            sendRequest: sendRequestStub,
            warn: sandbox.stub(),
        } as unknown as LanguageClient

        sessionManager = new SessionManager()
        lineTracker = new LineTracker()
        activeStateController = new InlineGeneratingMessage(lineTracker)

        // Create cursor update manager mock
        cursorUpdateManager = {
            recordCompletionRequest: sandbox.stub(),
            logger: { debug: sandbox.stub(), warn: sandbox.stub(), error: sandbox.stub() },
            updateIntervalMs: 250,
            isActive: false,
            lastRequestTime: 0,
            dispose: sandbox.stub(),
            start: sandbox.stub(),
            stop: sandbox.stub(),
            updatePosition: sandbox.stub(),
        } as unknown as CursorUpdateManager

        // Create status bar stub
        statusBarStub = {
            setLoading: sandbox.stub().resolves(),
            refreshStatusBar: sandbox.stub().resolves(),
        }

        sandbox.stub(CodeWhispererStatusBarManager, 'instance').get(() => statusBarStub)

        // Create the service without cursor update recorder initially
        service = new RecommendationService(sessionManager, activeStateController)
    })

    afterEach(() => {
        sandbox.restore()
        sessionManager.clear()
    })

    describe('constructor', () => {
        it('should initialize with optional cursorUpdateRecorder', () => {
            const serviceWithRecorder = new RecommendationService(
                sessionManager,
                activeStateController,
                cursorUpdateManager
            )

            // Verify the service was created with the recorder
            assert.strictEqual(serviceWithRecorder['cursorUpdateRecorder'], cursorUpdateManager)
        })
    })

    describe('setCursorUpdateRecorder', () => {
        it('should set the cursor update recorder', () => {
            // Initially the recorder should be undefined
            assert.strictEqual(service['cursorUpdateRecorder'], undefined)

            // Set the recorder
            service.setCursorUpdateRecorder(cursorUpdateManager)

            // Verify it was set correctly
            assert.strictEqual(service['cursorUpdateRecorder'], cursorUpdateManager)
        })
    })

    describe('getAllRecommendations', () => {
        it('should handle single request with no partial result token', async () => {
            const mockFirstResult = {
                sessionId: 'test-session',
                items: [mockInlineCompletionItemOne],
                partialResultToken: undefined,
            }

            sendRequestStub.resolves(mockFirstResult)

            await service.getAllRecommendations(
                languageClient,
                mockDocument,
                mockPosition,
                mockContext,
                mockToken,
                true
            )

            // Verify sendRequest was called with correct parameters
            assert(sendRequestStub.calledOnce)
            const requestArgs = sendRequestStub.firstCall.args[1]
            assert.deepStrictEqual(requestArgs, {
                textDocument: {
                    uri: 'file:///test.py',
                },
                position: mockPosition,
                context: mockContext,
            })

            // Verify session management
            const items = sessionManager.getActiveRecommendation()
            assert.deepStrictEqual(items, [mockInlineCompletionItemOne])
        })

        it('should handle multiple request with partial result token', async () => {
            const mockFirstResult = {
                sessionId: 'test-session',
                items: [mockInlineCompletionItemOne],
                partialResultToken: mockPartialResultToken,
            }

            const mockSecondResult = {
                sessionId: 'test-session',
                items: [mockInlineCompletionItemTwo],
                partialResultToken: undefined,
            }

            sendRequestStub.onFirstCall().resolves(mockFirstResult)
            sendRequestStub.onSecondCall().resolves(mockSecondResult)

            await service.getAllRecommendations(
                languageClient,
                mockDocument,
                mockPosition,
                mockContext,
                mockToken,
                true
            )

            // Verify sendRequest was called with correct parameters
            assert(sendRequestStub.calledTwice)
            const firstRequestArgs = sendRequestStub.firstCall.args[1]
            const expectedRequestArgs = {
                textDocument: {
                    uri: 'file:///test.py',
                },
                position: mockPosition,
                context: mockContext,
            }
            const secondRequestArgs = sendRequestStub.secondCall.args[1]
            assert.deepStrictEqual(firstRequestArgs, expectedRequestArgs)
            assert.deepStrictEqual(secondRequestArgs, {
                ...expectedRequestArgs,
                partialResultToken: mockPartialResultToken,
            })
        })

        it('should record completion request when cursorUpdateRecorder is set', async () => {
            // Set the cursor update recorder
            service.setCursorUpdateRecorder(cursorUpdateManager)

            const mockFirstResult = {
                sessionId: 'test-session',
                items: [mockInlineCompletionItemOne],
                partialResultToken: undefined,
            }

            sendRequestStub.resolves(mockFirstResult)

            await service.getAllRecommendations(
                languageClient,
                mockDocument,
                mockPosition,
                mockContext,
                mockToken,
                true
            )

            // Verify recordCompletionRequest was called
            // eslint-disable-next-line @typescript-eslint/unbound-method
            sinon.assert.calledOnce(cursorUpdateManager.recordCompletionRequest as sinon.SinonStub)
        })

        // Helper function to setup UI test
        function setupUITest() {
            const mockFirstResult = {
                sessionId: 'test-session',
                items: [mockInlineCompletionItemOne],
                partialResultToken: undefined,
            }

            sendRequestStub.resolves(mockFirstResult)

            // Spy on the UI methods
            const showGeneratingStub = sandbox.stub(activeStateController, 'showGenerating').resolves()
            const hideGeneratingStub = sandbox.stub(activeStateController, 'hideGenerating')

            return { showGeneratingStub, hideGeneratingStub }
        }

        it('should not show UI indicators when showUi option is false', async () => {
            const { showGeneratingStub, hideGeneratingStub } = setupUITest()

            // Call with showUi: false option
            await service.getAllRecommendations(
                languageClient,
                mockDocument,
                mockPosition,
                mockContext,
                mockToken,
                true,
                {
                    showUi: false,
                    emitTelemetry: true,
                }
            )

            // Verify UI methods were not called
            sinon.assert.notCalled(showGeneratingStub)
            sinon.assert.notCalled(hideGeneratingStub)
            sinon.assert.notCalled(statusBarStub.setLoading)
            sinon.assert.notCalled(statusBarStub.refreshStatusBar)
        })

        it('should show UI indicators when showUi option is true (default)', async () => {
            const { showGeneratingStub, hideGeneratingStub } = setupUITest()

            // Call with default options (showUi: true)
            await service.getAllRecommendations(
                languageClient,
                mockDocument,
                mockPosition,
                mockContext,
                mockToken,
                true
            )

            // Verify UI methods were called
            sinon.assert.calledOnce(showGeneratingStub)
            sinon.assert.calledOnce(hideGeneratingStub)
            sinon.assert.calledOnce(statusBarStub.setLoading)
            sinon.assert.calledOnce(statusBarStub.refreshStatusBar)
        })

        it('should handle errors gracefully', async () => {
            // Set the cursor update recorder
            service.setCursorUpdateRecorder(cursorUpdateManager)

            // Make the request throw an error
            const testError = new Error('Test error')
            sendRequestStub.rejects(testError)

            // Set up UI options
            const options = { showUi: true }

            // Stub the UI methods to avoid errors
            // const showGeneratingStub = sandbox.stub(activeStateController, 'showGenerating').resolves()
            const hideGeneratingStub = sandbox.stub(activeStateController, 'hideGenerating')

            // Temporarily replace console.error with a no-op function to prevent test failure
            const originalConsoleError = console.error
            console.error = () => {}

            try {
                // Call the method and expect it to handle the error
                const result = await service.getAllRecommendations(
                    languageClient,
                    mockDocument,
                    mockPosition,
                    mockContext,
                    mockToken,
                    true,
                    options
                )

                // Assert that error handling was done correctly
                assert.deepStrictEqual(result, [])

                // Verify the UI indicators were hidden even when an error occurs
                sinon.assert.calledOnce(hideGeneratingStub)
                sinon.assert.calledOnce(statusBarStub.refreshStatusBar)
            } finally {
                // Restore the original console.error function
                console.error = originalConsoleError
            }
        })
    })
})
