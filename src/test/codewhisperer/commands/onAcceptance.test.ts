/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { onAcceptance } from '../../../codewhisperer/commands/onAcceptance'
import { resetCodeWhispererGlobalVariables, createMockTextEditor } from '../testUtil'
import { CodeWhispererTracker } from '../../../codewhisperer/tracker/codewhispererTracker'
import { assertTelemetryCurried } from '../../testUtil'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { TelemetryHelper } from '../../../codewhisperer/util/telemetryHelper'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'

describe('onAcceptance', function () {
    describe('onAcceptance', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should enqueue an event object to tracker', async function () {
            const mockEditor = createMockTextEditor()
            const trackerSpy = sinon.spy(CodeWhispererTracker.prototype, 'enqueue')
            const extensionContext = await FakeExtensionContext.create()
            const fakeReferences = [
                {
                    message: '',
                    licenseName: 'MIT',
                    repository: 'http://github.com/fake',
                    recommendationContentSpan: {
                        start: 0,
                        end: 10,
                    },
                },
            ]
            await onAcceptance(
                {
                    editor: mockEditor,
                    range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 26)),
                    acceptIndex: 0,
                    recommendation: "print('Hello World!')",
                    requestId: '',
                    sessionId: '',
                    triggerType: 'OnDemand',
                    completionType: 'Line',
                    language: 'python',
                    references: fakeReferences,
                },
                extensionContext.globalState
            )
            const actualArg = trackerSpy.getCall(0).args[0]
            assert.ok(trackerSpy.calledOnce)
            assert.strictEqual(actualArg.originalString, 'def two_sum(nums, target):')
            assert.strictEqual(actualArg.requestId, '')
            assert.strictEqual(actualArg.sessionId, '')
            assert.strictEqual(actualArg.triggerType, 'OnDemand')
            assert.strictEqual(actualArg.completionType, 'Line')
            assert.strictEqual(actualArg.language, 'python')
            assert.deepStrictEqual(actualArg.startPosition, new vscode.Position(1, 0))
            assert.deepStrictEqual(actualArg.endPosition, new vscode.Position(1, 26))
            assert.strictEqual(actualArg.index, 0)
        })

        it('Should report telemetry that records this user decision event', async function () {
            const testStartUrl = 'testStartUrl'
            sinon.stub(TelemetryHelper.instance, 'startUrl').value(testStartUrl)
            const mockEditor = createMockTextEditor()
            RecommendationHandler.instance.requestId = 'test'
            RecommendationHandler.instance.sessionId = 'test'
            RecommendationHandler.instance.startPos = new vscode.Position(1, 0)
            mockEditor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0))
            RecommendationHandler.instance.recommendations = [{ content: "print('Hello World!')" }]
            RecommendationHandler.instance.setSuggestionState(0, 'Showed')
            TelemetryHelper.instance.triggerType = 'OnDemand'
            TelemetryHelper.instance.completionType = 'Line'
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userDecision')
            const extensionContext = await FakeExtensionContext.create()
            await onAcceptance(
                {
                    editor: mockEditor,
                    range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 21)),
                    acceptIndex: 0,
                    recommendation: "print('Hello World!')",
                    requestId: '',
                    sessionId: '',
                    triggerType: 'OnDemand',
                    completionType: 'Line',
                    language: 'python',
                    references: undefined,
                },
                extensionContext.globalState
            )
            assertTelemetry({
                codewhispererRequestId: 'test',
                codewhispererSessionId: 'test',
                codewhispererPaginationProgress: 1,
                codewhispererTriggerType: 'OnDemand',
                codewhispererSuggestionIndex: 0,
                codewhispererSuggestionState: 'Accept',
                codewhispererSuggestionReferenceCount: 0,
                codewhispererCompletionType: 'Line',
                codewhispererLanguage: 'python',
                credentialStartUrl: testStartUrl,
            })
        })
    })
})
