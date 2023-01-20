/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { DefaultCodeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import { assertTelemetryCurried } from '../../testUtil'
import { RecommendationsList } from '../../../codewhisperer/client/codewhisperer'
import { ConfigurationEntry } from '../../../codewhisperer/models/model'
import { createMockTextEditor, resetCodeWhispererGlobalVariables } from '../testUtil'
import { TelemetryHelper } from '../../../codewhisperer/util/telemetryHelper'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'
import { stub } from '../../utilities/stubber'
import { CodeWhispererCodeCoverageTracker } from '../../../codewhisperer/tracker/codewhispererCodeCoverageTracker'
import { FakeMemento } from '../../fakeExtensionContext'

const performance = globalThis.performance ?? require('perf_hooks').performance

describe('recommendationHandler', function () {
    const config: ConfigurationEntry = {
        isShowMethodsEnabled: true,
        isManualTriggerEnabled: true,
        isAutomatedTriggerEnabled: true,
        isSuggestionsWithCodeReferencesEnabled: true,
    }
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })

    describe('getRecommendations', async function () {
        const fakeMemeto = new FakeMemento()
        const mockClient = stub(DefaultCodeWhispererClient)
        const mockEditor = createMockTextEditor()

        beforeEach(function () {
            sinon.restore()
            resetCodeWhispererGlobalVariables()
            mockClient.listRecommendations.resolves({})
            mockClient.generateRecommendations.resolves({})
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should assign correct recommendations given input', async function () {
            assert.strictEqual(CodeWhispererCodeCoverageTracker.instances.size, 0)
            assert.strictEqual(
                CodeWhispererCodeCoverageTracker.getTracker(mockEditor.document.languageId, fakeMemeto)
                    ?.serviceInvocationCount,
                0
            )

            const mockServerResult = {
                recommendations: [{ content: "print('Hello World!')" }, { content: '' }],
                $response: {
                    requestId: 'test_request',
                    httpResponse: {
                        headers: {
                            'x-amzn-sessionid': 'test_request',
                        },
                    },
                },
            }
            const handler = new RecommendationHandler()
            sinon.stub(handler, 'getServerResponse').resolves(mockServerResult)
            await handler.getRecommendations(mockClient, mockEditor, 'AutoTrigger', config, 'Enter', false)
            const actual = handler.recommendations
            const expected: RecommendationsList = [{ content: "print('Hello World!')" }, { content: '' }]
            assert.deepStrictEqual(actual, expected)
            assert.strictEqual(
                CodeWhispererCodeCoverageTracker.getTracker(mockEditor.document.languageId, fakeMemeto)
                    ?.serviceInvocationCount,
                1
            )
        })

        it('should assign request id correctly', async function () {
            const mockServerResult = {
                recommendations: [{ content: "print('Hello World!')" }, { content: '' }],
                $response: {
                    requestId: 'test_request',
                    httpResponse: {
                        headers: {
                            'x-amzn-sessionid': 'test_request',
                        },
                    },
                },
            }
            const handler = new RecommendationHandler()
            sinon.stub(handler, 'getServerResponse').resolves(mockServerResult)
            await handler.getRecommendations(mockClient, mockEditor, 'AutoTrigger', config, 'Enter', false)
            assert.strictEqual(handler.requestId, 'test_request')
            assert.strictEqual(handler.sessionId, 'test_request')
            assert.strictEqual(TelemetryHelper.instance.triggerType, 'AutoTrigger')
        })

        it('should call telemetry function that records a CodeWhisperer service invocation', async function () {
            const mockServerResult = {
                recommendations: [{ content: "print('Hello World!')" }, { content: '' }],
                $response: {
                    requestId: 'test_request',
                    httpResponse: {
                        headers: {
                            'x-amzn-sessionid': 'test_request',
                        },
                    },
                },
            }
            const handler = new RecommendationHandler()
            sinon.stub(handler, 'getServerResponse').resolves(mockServerResult)
            sinon.stub(performance, 'now').returns(0.0)
            handler.startPos = new vscode.Position(1, 0)
            TelemetryHelper.instance.cursorOffset = 2
            await handler.getRecommendations(mockClient, mockEditor, 'AutoTrigger', config, 'Enter')
            const assertTelemetry = assertTelemetryCurried('codewhisperer_serviceInvocation')
            assertTelemetry({
                codewhispererRequestId: 'test_request',
                codewhispererSessionId: 'test_request',
                codewhispererLastSuggestionIndex: -1,
                codewhispererTriggerType: 'AutoTrigger',
                codewhispererAutomatedTriggerType: 'Enter',
                codewhispererCompletionType: 'Line',
                result: 'Succeeded',
                codewhispererLineNumber: 1,
                codewhispererCursorOffset: 38,
                codewhispererLanguage: 'python',
            })
        })

        it('should call telemetry function that records a Empty userDecision event', async function () {
            const mockServerResult = {
                recommendations: [],
                nextToken: '',
                $response: {
                    requestId: 'test_request_empty',
                    httpResponse: {
                        headers: {
                            'x-amzn-sessionid': 'test_request_empty',
                        },
                    },
                },
            }
            const handler = new RecommendationHandler()
            sinon.stub(handler, 'getServerResponse').resolves(mockServerResult)
            sinon.stub(performance, 'now').returns(0.0)
            handler.startPos = new vscode.Position(1, 0)
            TelemetryHelper.instance.cursorOffset = 2
            await handler.getRecommendations(mockClient, mockEditor, 'AutoTrigger', config, 'Enter')
            const assertTelemetry = assertTelemetryCurried('codewhisperer_userDecision')
            assertTelemetry({
                codewhispererRequestId: 'test_request_empty',
                codewhispererSessionId: 'test_request_empty',
                codewhispererPaginationProgress: 0,
                codewhispererTriggerType: 'AutoTrigger',
                codewhispererSuggestionIndex: -1,
                codewhispererSuggestionState: 'Empty',
                codewhispererSuggestionReferenceCount: 0,
                codewhispererCompletionType: 'Line',
                codewhispererLanguage: 'python',
            })
        })
    })

    describe('isValidResponse', function () {
        afterEach(function () {
            sinon.restore()
        })
        it('should return true if any response is not empty', function () {
            const handler = new RecommendationHandler()
            handler.recommendations = [
                {
                    content:
                        '\n    // Use the console to output debug info…n of the command with the "command" variable',
                },
                { content: '' },
            ]
            assert.ok(handler.isValidResponse())
        })

        it('should return false if response is empty', function () {
            const handler = new RecommendationHandler()
            handler.recommendations = []
            assert.ok(!handler.isValidResponse())
        })

        it('should return false if all response has no string length', function () {
            const handler = new RecommendationHandler()
            handler.recommendations = [{ content: '' }, { content: '' }]
            assert.ok(!handler.isValidResponse())
        })
    })
})
