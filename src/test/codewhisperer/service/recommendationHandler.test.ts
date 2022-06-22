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

const performance = globalThis.performance ?? require('perf_hooks').performance

describe('recommendationHandler', function () {
    const config: ConfigurationEntry = {
        isShowMethodsEnabled: true,
        isManualTriggerEnabled: true,
        isAutomatedTriggerEnabled: true,
        isIncludeSuggestionsWithCodeReferencesEnabled: true,
    }
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })

    describe('getRecommendations', async function () {
        const mockClient: DefaultCodeWhispererClient = new DefaultCodeWhispererClient()
        const mockEditor = createMockTextEditor()

        beforeEach(function () {
            sinon.restore()
            resetCodeWhispererGlobalVariables()
            sinon.stub(mockClient, 'listRecommendations')
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should assign correct recommendations given input', async function () {
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
            const recommendationHandler = new RecommendationHandler()
            sinon.stub(recommendationHandler, 'getServerResponse').resolves(mockServerResult)
            await recommendationHandler.getRecommendations(
                mockClient,
                mockEditor,
                'AutoTrigger',
                config,
                'Enter',
                false
            )
            const actual = recommendationHandler.recommendations
            const expected: RecommendationsList = [{ content: "print('Hello World!')" }]
            assert.deepStrictEqual(actual, expected)
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
            const recommendationHandler = new RecommendationHandler()
            sinon.stub(recommendationHandler, 'getServerResponse').resolves(mockServerResult)
            await recommendationHandler.getRecommendations(
                mockClient,
                mockEditor,
                'AutoTrigger',
                config,
                'Enter',
                false
            )
            assert.strictEqual(recommendationHandler.requestId, 'test_request')
            assert.strictEqual(recommendationHandler.sessionId, 'test_request')
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
            const recommendationHandler = new RecommendationHandler()
            sinon.stub(recommendationHandler, 'getServerResponse').resolves(mockServerResult)
            sinon.stub(performance, 'now').returns(0.0)
            recommendationHandler.startPos = new vscode.Position(1, 0)
            TelemetryHelper.instance.cursorOffset = 2
            await recommendationHandler.getRecommendations(mockClient, mockEditor, 'AutoTrigger', config, 'Enter')
            const assertTelemetry = assertTelemetryCurried('codewhisperer_serviceInvocation')
            assertTelemetry({
                codewhispererRequestId: 'test_request',
                codewhispererSessionId: 'test_request',
                codewhispererLastSuggestionIndex: -1,
                codewhispererTriggerType: 'AutoTrigger',
                codewhispererAutomatedTriggerType: 'Enter',
                codewhispererCompletionType: 'Line',
                result: 'Succeeded',
                duration: 0.0,
                codewhispererLineNumber: 1,
                codewhispererCursorOffset: 38,
                codewhispererLanguage: 'python',
            })
        })
    })

    describe('isValidResponse', function () {
        afterEach(function () {
            sinon.restore()
        })
        it('should return true if any response is not empty', function () {
            RecommendationHandler.instance.recommendations = [
                {
                    content:
                        '\n    // Use the console to output debug info…n of the command with the "command" variable',
                },
                { content: '' },
            ]
            assert.ok(RecommendationHandler.instance.isValidResponse())
        })

        it('should return false if response is empty', function () {
            RecommendationHandler.instance.recommendations = []
            assert.ok(!RecommendationHandler.instance.isValidResponse())
        })

        it('should return false if all response has no string length', function () {
            RecommendationHandler.instance.recommendations = [{ content: '' }, { content: '' }]
            assert.ok(!RecommendationHandler.instance.isValidResponse())
        })
    })
})
