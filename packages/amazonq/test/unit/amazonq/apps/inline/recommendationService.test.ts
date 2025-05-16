/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { LanguageClient } from 'vscode-languageclient'
import { Position, CancellationToken, InlineCompletionItem } from 'vscode'
import assert from 'assert'
import { RecommendationService } from '../../../../../src/app/inline/recommendationService'
import { SessionManager } from '../../../../../src/app/inline/sessionManager'
import { createMockDocument } from 'aws-core-vscode/test'
import { LineTracker } from 'aws-core-vscode/codewhisperer'
import { InlineGeneratingMessage } from '../../../../../src/app/inline/inlineGeneratingMessage'

describe('RecommendationService', () => {
    let languageClient: LanguageClient
    let sendRequestStub: sinon.SinonStub
    let sandbox: sinon.SinonSandbox
    const mockDocument = createMockDocument()
    const mockPosition = { line: 0, character: 0 } as Position
    const mockContext = { triggerKind: 1, selectedCompletionInfo: undefined }
    const mockToken = { isCancellationRequested: false } as CancellationToken
    const mockInlineCompletionItemOne = {
        insertText: 'ItemOne',
    } as InlineCompletionItem

    const mockInlineCompletionItemTwo = {
        insertText: 'ItemTwo',
    } as InlineCompletionItem
    const mockPartialResultToken = 'some-random-token'
    const sessionManager = new SessionManager()
    const lineTracker = new LineTracker()
    const activeStateController = new InlineGeneratingMessage(lineTracker)
    const service = new RecommendationService(sessionManager, activeStateController)

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        sendRequestStub = sandbox.stub()

        languageClient = {
            sendRequest: sendRequestStub,
        } as unknown as LanguageClient
    })

    afterEach(() => {
        sandbox.restore()
        sessionManager.clear()
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

            // Verify session management
            const items = sessionManager.getActiveRecommendation()
            assert.deepStrictEqual(items, [mockInlineCompletionItemOne, { insertText: '1' } as InlineCompletionItem])
            sessionManager.incrementActiveIndex()
            const items2 = sessionManager.getActiveRecommendation()
            assert.deepStrictEqual(items2, [mockInlineCompletionItemTwo, { insertText: '1' } as InlineCompletionItem])
        })
    })
})
