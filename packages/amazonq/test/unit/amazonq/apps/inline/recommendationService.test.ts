/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { BaseLanguageClient } from 'vscode-languageclient'
import { Position, CancellationToken, InlineCompletionItem, InlineCompletionTriggerKind } from 'vscode'
import assert from 'assert'
import { RecommendationService } from '../../../../../src/app/inline/recommendationService'
import { SessionManager } from '../../../../../src/app/inline/sessionManager'
import { createMockDocument } from 'aws-core-vscode/test'
// Import CursorUpdateManager directly instead of the interface
import { CursorUpdateManager } from '../../../../../src/app/inline/cursorUpdateManager'
import { CodeWhispererStatusBarManager } from 'aws-core-vscode/codewhisperer'
import { globals } from 'aws-core-vscode/shared'
import { DocumentEventListener } from '../../../../../src/app/inline/documentEventListener'
import { EditSuggestionState } from '../../../../../src/app/inline/editSuggestionState'

const completionApi = 'aws/textDocument/inlineCompletionWithReferences'
const editApi = 'aws/textDocument/editCompletion'

describe('RecommendationService', () => {
    let languageClient: BaseLanguageClient
    let sendRequestStub: sinon.SinonStub
    let sandbox: sinon.SinonSandbox
    let sessionManager: SessionManager
    let service: RecommendationService
    let cursorUpdateManager: CursorUpdateManager
    let statusBarStub: any
    let clockStub: sinon.SinonFakeTimers
    const mockDocument = createMockDocument()
    const mockPosition = { line: 0, character: 0 } as Position
    const mockContext = { triggerKind: InlineCompletionTriggerKind.Automatic, selectedCompletionInfo: undefined }
    const mockToken = { isCancellationRequested: false } as CancellationToken
    const mockDocumentEventListener = {
        isLastEventDeletion: (filepath: string) => false,
        getLastDocumentChangeEvent: (filepath: string) => undefined,
    } as DocumentEventListener
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
        } as unknown as BaseLanguageClient

        sessionManager = new SessionManager()

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
        service = new RecommendationService(sessionManager)
    })

    afterEach(() => {
        sandbox.restore()
        sessionManager.clear()
    })

    describe('constructor', () => {
        it('should initialize with optional cursorUpdateRecorder', () => {
            const serviceWithRecorder = new RecommendationService(sessionManager, cursorUpdateManager)

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
            // Mock EditSuggestionState to return false (no edit suggestion active)
            sandbox.stub(EditSuggestionState, 'isEditSuggestionActive').returns(false)

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
                true,
                mockDocumentEventListener
            )

            // Verify sendRequest was called with correct parameters
            const cs = sendRequestStub.getCalls()
            const completionCalls = cs.filter((c) => c.firstArg === completionApi)
            const editCalls = cs.filter((c) => c.firstArg === editApi)
            assert.strictEqual(cs.length, 2)
            assert.strictEqual(completionCalls.length, 1)
            assert.strictEqual(editCalls.length, 1)

            const requestArgs = completionCalls[0].args[1]
            assert.deepStrictEqual(requestArgs, {
                textDocument: {
                    uri: 'file:///test.py',
                },
                position: mockPosition,
                context: mockContext,
                documentChangeParams: undefined,
                openTabFilepaths: [],
            })

            // Verify session management
            const items = sessionManager.getActiveRecommendation()
            assert.deepStrictEqual(items, [mockInlineCompletionItemOne])
        })

        it('should handle multiple request with partial result token', async () => {
            // Mock EditSuggestionState to return false (no edit suggestion active)
            sandbox.stub(EditSuggestionState, 'isEditSuggestionActive').returns(false)

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
                true,
                mockDocumentEventListener
            )

            // Verify sendRequest was called with correct parameters
            const cs = sendRequestStub.getCalls()
            const completionCalls = cs.filter((c) => c.firstArg === completionApi)
            const editCalls = cs.filter((c) => c.firstArg === editApi)
            assert.strictEqual(cs.length, 3)
            assert.strictEqual(completionCalls.length, 2)
            assert.strictEqual(editCalls.length, 1)

            const firstRequestArgs = completionCalls[0].args[1]
            const expectedRequestArgs = {
                textDocument: {
                    uri: 'file:///test.py',
                },
                position: mockPosition,
                context: mockContext,
                documentChangeParams: undefined,
                openTabFilepaths: [],
            }
            const secondRequestArgs = completionCalls[1].args[1]
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
                true,
                mockDocumentEventListener
            )

            // Verify recordCompletionRequest was called
            // eslint-disable-next-line @typescript-eslint/unbound-method
            sinon.assert.calledOnce(cursorUpdateManager.recordCompletionRequest as sinon.SinonStub)
        })

        it('should not show UI indicators when showUi option is false', async () => {
            // Call with showUi: false option
            await service.getAllRecommendations(
                languageClient,
                mockDocument,
                mockPosition,
                mockContext,
                mockToken,
                true,
                mockDocumentEventListener,
                {
                    showUi: false,
                    emitTelemetry: true,
                }
            )

            // Verify UI methods were not called
            sinon.assert.notCalled(statusBarStub.setLoading)
            sinon.assert.notCalled(statusBarStub.refreshStatusBar)
        })

        it('should show UI indicators when showUi option is true (default)', async () => {
            // Call with default options (showUi: true)
            await service.getAllRecommendations(
                languageClient,
                mockDocument,
                mockPosition,
                mockContext,
                mockToken,
                true,
                mockDocumentEventListener
            )

            // Verify UI methods were called
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
                    mockDocumentEventListener,
                    options
                )

                // Assert that error handling was done correctly
                assert.deepStrictEqual(result, [])

                // Verify the UI indicators were hidden even when an error occurs
                sinon.assert.calledOnce(statusBarStub.refreshStatusBar)
            } finally {
                // Restore the original console.error function
                console.error = originalConsoleError
            }
        })

        it('should not make completion request when edit suggestion is active', async () => {
            // Mock EditSuggestionState to return true (edit suggestion is active)
            sandbox.stub(EditSuggestionState, 'isEditSuggestionActive').returns(true)

            const mockResult = {
                sessionId: 'test-session',
                items: [mockInlineCompletionItemOne],
                partialResultToken: undefined,
            }

            sendRequestStub.resolves(mockResult)

            await service.getAllRecommendations(
                languageClient,
                mockDocument,
                mockPosition,
                mockContext,
                mockToken,
                true,
                mockDocumentEventListener
            )

            // Verify sendRequest was called only for edit API, not completion API
            const cs = sendRequestStub.getCalls()
            const completionCalls = cs.filter((c) => c.firstArg === completionApi)
            const editCalls = cs.filter((c) => c.firstArg === editApi)

            assert.strictEqual(cs.length, 1) // Only edit call
            assert.strictEqual(completionCalls.length, 0) // No completion calls
            assert.strictEqual(editCalls.length, 1) // One edit call
        })

        it('should make completion request when edit suggestion is not active', async () => {
            // Mock EditSuggestionState to return false (no edit suggestion active)
            sandbox.stub(EditSuggestionState, 'isEditSuggestionActive').returns(false)

            const mockResult = {
                sessionId: 'test-session',
                items: [mockInlineCompletionItemOne],
                partialResultToken: undefined,
            }

            sendRequestStub.resolves(mockResult)

            await service.getAllRecommendations(
                languageClient,
                mockDocument,
                mockPosition,
                mockContext,
                mockToken,
                true,
                mockDocumentEventListener
            )

            // Verify sendRequest was called for both APIs
            const cs = sendRequestStub.getCalls()
            const completionCalls = cs.filter((c) => c.firstArg === completionApi)
            const editCalls = cs.filter((c) => c.firstArg === editApi)

            assert.strictEqual(cs.length, 2) // Both calls
            assert.strictEqual(completionCalls.length, 1) // One completion call
            assert.strictEqual(editCalls.length, 1) // One edit call
        })
    })
})
