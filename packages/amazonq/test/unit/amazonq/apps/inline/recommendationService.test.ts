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
import { createMockDocument, createTestAuthUtil } from 'aws-core-vscode/test'
import { LineTracker } from '../../../../../src/app/inline/stateTracker/lineTracker'
import { InlineGeneratingMessage } from '../../../../../src/app/inline/inlineGeneratingMessage'
import { ICursorUpdateRecorder } from '../../../../../src/app/inline/cursorUpdateManager'
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
    let cursorUpdateRecorder: ICursorUpdateRecorder
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

        await createTestAuthUtil()

        sessionManager = new SessionManager()
        lineTracker = new LineTracker()
        activeStateController = new InlineGeneratingMessage(lineTracker)

        // Create cursor update recorder mock
        cursorUpdateRecorder = {
            recordCompletionRequest: sandbox.stub(),
        }

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
                cursorUpdateRecorder
            )

            // Verify the service was created with the recorder
            assert.strictEqual(serviceWithRecorder['cursorUpdateRecorder'], cursorUpdateRecorder)
        })
    })

    describe('setCursorUpdateRecorder', () => {
        it('should set the cursor update recorder', () => {
            // Initially the recorder should be undefined
            assert.strictEqual(service['cursorUpdateRecorder'], undefined)

            // Set the recorder
            service.setCursorUpdateRecorder(cursorUpdateRecorder)

            // Verify it was set correctly
            assert.strictEqual(service['cursorUpdateRecorder'], cursorUpdateRecorder)
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

            await service.getAllRecommendations(languageClient, mockDocument, mockPosition, mockContext, mockToken)

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

            await service.getAllRecommendations(languageClient, mockDocument, mockPosition, mockContext, mockToken)

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
            service.setCursorUpdateRecorder(cursorUpdateRecorder)

            const mockFirstResult = {
                sessionId: 'test-session',
                items: [mockInlineCompletionItemOne],
                partialResultToken: undefined,
            }

            sendRequestStub.resolves(mockFirstResult)

            await service.getAllRecommendations(languageClient, mockDocument, mockPosition, mockContext, mockToken)

            // Verify recordCompletionRequest was called
            sinon.assert.calledOnce(cursorUpdateRecorder.recordCompletionRequest as sinon.SinonStub)
        })

        it('should not show UI indicators when ui option is false', async () => {
            const mockFirstResult = {
                sessionId: 'test-session',
                items: [mockInlineCompletionItemOne],
                partialResultToken: undefined,
            }

            sendRequestStub.resolves(mockFirstResult)

            // Spy on the UI methods
            const showGeneratingSpy = sandbox.spy(activeStateController, 'showGenerating')
            const hideGeneratingSpy = sandbox.spy(activeStateController, 'hideGenerating')

            // Call with ui: false option
            await service.getAllRecommendations(languageClient, mockDocument, mockPosition, mockContext, mockToken, {
                ui: false,
            })

            // Verify UI methods were not called
            sinon.assert.notCalled(showGeneratingSpy)
            sinon.assert.notCalled(hideGeneratingSpy)
            sinon.assert.notCalled(statusBarStub.setLoading)
            sinon.assert.notCalled(statusBarStub.refreshStatusBar)
        })

        it('should show UI indicators when ui option is true (default)', async () => {
            const mockFirstResult = {
                sessionId: 'test-session',
                items: [mockInlineCompletionItemOne],
                partialResultToken: undefined,
            }

            sendRequestStub.resolves(mockFirstResult)

            // Call with default options (ui: true)
            await service.getAllRecommendations(languageClient, mockDocument, mockPosition, mockContext, mockToken)

            // Verify UI methods were called
            sinon.assert.calledOnce(activeStateController.showGenerating as sinon.SinonStub)
            sinon.assert.calledOnce(activeStateController.hideGenerating as sinon.SinonStub)
            sinon.assert.calledOnce(statusBarStub.setLoading)
            sinon.assert.calledOnce(statusBarStub.refreshStatusBar)
        })

        it('should handle errors gracefully', async () => {
            // Set the cursor update recorder
            service.setCursorUpdateRecorder(cursorUpdateRecorder)

            // Make the request throw an error
            const testError = new Error('Test error')
            sendRequestStub.rejects(testError)

            // Call the method
            await service.getAllRecommendations(languageClient, mockDocument, mockPosition, mockContext, mockToken)

            // Verify the UI indicators were hidden even when an error occurs
            sinon.assert.calledOnce(activeStateController.hideGenerating as sinon.SinonStub)
            sinon.assert.calledOnce(statusBarStub.refreshStatusBar)
        })
    })
})
