/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { AmazonQInlineCompletionItemProvider } from '../../../../src/app/inline/completion'

describe('AmazonQInlineCompletionItemProvider', function () {
    let provider: AmazonQInlineCompletionItemProvider
    let mockLanguageClient: any
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockLanguageClient = {
            sendNotification: sandbox.stub(),
        }

        // Create provider with minimal mocks
        provider = new AmazonQInlineCompletionItemProvider(
            mockLanguageClient,
            {} as any, // recommendationService
            {} as any, // sessionManager
            {} as any, // inlineTutorialAnnotation
            {} as any // documentEventListener
        )
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('batchDiscardTelemetryForEditSuggestion', function () {
        it('should batch multiple completion items into single telemetry event', function () {
            const items = [
                { itemId: 'item1', isInlineEdit: false },
                { itemId: 'item2', isInlineEdit: false },
                { itemId: 'item3', isInlineEdit: false },
            ]

            const session = {
                sessionId: 'test-session',
                firstCompletionDisplayLatency: 100,
                requestStartTime: performance.now() - 1000,
            }

            provider.batchDiscardTelemetryForEditSuggestion(items, session)

            // Verify single telemetry notification was sent
            assert.strictEqual(mockLanguageClient.sendNotification.callCount, 1)

            // Verify the notification contains all items
            const call = mockLanguageClient.sendNotification.getCall(0)
            const params = call.args[1]

            assert.strictEqual(params.sessionId, 'test-session')
            assert.strictEqual(Object.keys(params.completionSessionResult).length, 3)
            assert.deepStrictEqual(params.completionSessionResult.item1, {
                seen: false,
                accepted: false,
                discarded: true,
            })
            assert.deepStrictEqual(params.completionSessionResult.item2, {
                seen: false,
                accepted: false,
                discarded: true,
            })
            assert.deepStrictEqual(params.completionSessionResult.item3, {
                seen: false,
                accepted: false,
                discarded: true,
            })
        })

        it('should filter out inline edit items', function () {
            const items = [
                { itemId: 'item1', isInlineEdit: false },
                { itemId: 'item2', isInlineEdit: true }, // Should be filtered out
                { itemId: 'item3', isInlineEdit: false },
            ]

            const session = {
                sessionId: 'test-session',
                firstCompletionDisplayLatency: 100,
                requestStartTime: performance.now() - 1000,
            }

            provider.batchDiscardTelemetryForEditSuggestion(items, session)

            const call = mockLanguageClient.sendNotification.getCall(0)
            const params = call.args[1]

            // Should only include 2 items (item2 filtered out)
            assert.strictEqual(Object.keys(params.completionSessionResult).length, 2)
            assert.ok(params.completionSessionResult.item1)
            assert.ok(params.completionSessionResult.item3)
            assert.ok(!params.completionSessionResult.item2)
        })

        it('should not send notification when no valid items', function () {
            const items = [
                { itemId: 'item1', isInlineEdit: true }, // Filtered out
                { itemId: null, isInlineEdit: false }, // No itemId
            ]

            const session = {
                sessionId: 'test-session',
                firstCompletionDisplayLatency: 100,
                requestStartTime: performance.now() - 1000,
            }

            provider.batchDiscardTelemetryForEditSuggestion(items, session)

            // No notification should be sent
            assert.strictEqual(mockLanguageClient.sendNotification.callCount, 0)
        })
    })

    describe('isCompletionActive', function () {
        let mockSessionManager: any
        let mockVscodeCommands: any

        beforeEach(function () {
            mockSessionManager = {
                getActiveSession: sandbox.stub(),
            }

            // Mock vscode.commands.executeCommand
            mockVscodeCommands = sandbox.stub(require('vscode').commands, 'executeCommand')

            // Create provider with mocked session manager
            provider = new AmazonQInlineCompletionItemProvider(
                mockLanguageClient,
                {} as any, // recommendationService
                mockSessionManager,
                {} as any, // inlineTutorialAnnotation
                {} as any // documentEventListener
            )
        })

        it('should return false when no active session', async function () {
            mockSessionManager.getActiveSession.returns(undefined)

            const result = await provider.isCompletionActive()

            assert.strictEqual(result, false)
            assert.strictEqual(mockVscodeCommands.callCount, 0)
        })

        it('should return false when session not displayed', async function () {
            mockSessionManager.getActiveSession.returns({
                displayed: false,
                suggestions: [{ isInlineEdit: false }],
            })

            const result = await provider.isCompletionActive()

            assert.strictEqual(result, false)
            assert.strictEqual(mockVscodeCommands.callCount, 0)
        })

        it('should return false when session has inline edit suggestions', async function () {
            mockSessionManager.getActiveSession.returns({
                displayed: true,
                suggestions: [{ isInlineEdit: true }],
            })

            const result = await provider.isCompletionActive()

            assert.strictEqual(result, false)
            assert.strictEqual(mockVscodeCommands.callCount, 0)
        })

        it('should return true when VS Code command executes successfully', async function () {
            mockSessionManager.getActiveSession.returns({
                displayed: true,
                suggestions: [{ isInlineEdit: false }],
            })
            mockVscodeCommands.resolves()

            const result = await provider.isCompletionActive()

            assert.strictEqual(result, true)
            assert.strictEqual(mockVscodeCommands.callCount, 1)
            assert.strictEqual(mockVscodeCommands.getCall(0).args[0], 'aws.amazonq.checkInlineSuggestionVisibility')
        })

        it('should return false when VS Code command fails', async function () {
            mockSessionManager.getActiveSession.returns({
                displayed: true,
                suggestions: [{ isInlineEdit: false }],
            })
            mockVscodeCommands.rejects(new Error('Command failed'))

            const result = await provider.isCompletionActive()

            assert.strictEqual(result, false)
            assert.strictEqual(mockVscodeCommands.callCount, 1)
            assert.strictEqual(mockVscodeCommands.getCall(0).args[0], 'aws.amazonq.checkInlineSuggestionVisibility')
        })
    })
})
