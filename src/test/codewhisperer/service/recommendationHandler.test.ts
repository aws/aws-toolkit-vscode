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
        const mockClient = stub(DefaultCodeWhispererClient)
        const mockEditor = createMockTextEditor()

        beforeEach(function () {
            sinon.restore()
            resetCodeWhispererGlobalVariables()
            mockClient.listRecommendations.resolves({})
            mockClient.generateRecommendations.resolves({})
            RecommendationHandler.instance.clearRecommendations()
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
            sinon.stub(RecommendationHandler.instance, 'getServerResponse').resolves(mockServerResult)
            await RecommendationHandler.instance.getRecommendations(
                mockClient,
                mockEditor,
                'AutoTrigger',
                config,
                'Enter',
                false
            )
            const actual = RecommendationHandler.instance.recommendations
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
            sinon.stub(RecommendationHandler.instance, 'getServerResponse').resolves(mockServerResult)
            await RecommendationHandler.instance.getRecommendations(
                mockClient,
                mockEditor,
                'AutoTrigger',
                config,
                'Enter',
                false
            )
            assert.strictEqual(RecommendationHandler.instance.requestId, 'test_request')
            assert.strictEqual(RecommendationHandler.instance.sessionId, 'test_request')
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
            sinon.stub(RecommendationHandler.instance, 'getServerResponse').resolves(mockServerResult)
            sinon.stub(performance, 'now').returns(0.0)
            RecommendationHandler.instance.startPos = new vscode.Position(1, 0)
            TelemetryHelper.instance.cursorOffset = 2
            await RecommendationHandler.instance.getRecommendations(
                mockClient,
                mockEditor,
                'AutoTrigger',
                config,
                'Enter'
            )
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
