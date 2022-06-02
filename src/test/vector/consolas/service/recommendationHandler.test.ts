/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { DefaultConsolasClient } from '../../../../vector/consolas/client/consolas'
import { AWSError } from 'aws-sdk'
import { assertTelemetryCurried } from '../../../testUtil'
import { RecommendationsList } from '../../../../vector/consolas/client/consolas'
import { ConfigurationEntry } from '../../../../vector/consolas/models/model'
import { createMockTextEditor, resetConsolasGlobalVariables } from '../testUtil'
import { UnsupportedLanguagesCache } from '../../../../vector/consolas/util/unsupportedLanguagesCache'
import { TelemetryHelper } from '../../../../vector/consolas/util/telemetryHelper'
import { RecommendationHandler } from '../../../../vector/consolas/service/recommendationHandler'

const performance = globalThis.performance ?? require('perf_hooks').performance

describe('recommendationHandler', function () {
    const config: ConfigurationEntry = {
        isShowMethodsEnabled: true,
        isManualTriggerEnabled: true,
        isAutomatedTriggerEnabled: true,
        isIncludeSuggestionsWithCodeReferencesEnabled: true,
    }
    beforeEach(function () {
        resetConsolasGlobalVariables()
    })

    describe('getRecommendations', async function () {
        const mockClient: DefaultConsolasClient = new DefaultConsolasClient()
        const mockEditor = createMockTextEditor()

        beforeEach(function () {
            sinon.restore()
            resetConsolasGlobalVariables()
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
            const expected: RecommendationsList = [{ content: "print('Hello World!')" }, { content: '' }]
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

        it('should call telemetry function that records a consolas service invocation', async function () {
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
            const assertTelemetry = assertTelemetryCurried('consolas_serviceInvocation')
            assertTelemetry({
                consolasRequestId: 'test_request',
                consolasSessionId: 'test_request',
                consolasSuggestionIndex: 0,
                consolasTriggerType: 'AutoTrigger',
                consolasAutomatedtriggerType: 'Enter',
                consolasCompletionType: 'Line',
                result: 'Succeeded',
                duration: 0.0,
                consolasLineNumber: 1,
                consolasCursorOffset: 38,
                consolasLanguage: 'python',
                consolasRuntime: 'python2',
                consolasRuntimeSource: '2.7.16',
            })
        })

        it('should add language to unsupported cache when server returns programming language error', async function () {
            UnsupportedLanguagesCache.clear()
            const awsError: AWSError = {
                code: 'ValidationException',
                message: `Improperly formed request: 1 validation error detected: Value 'c' 
                at 'contextInfo.programmingLanguage.languageName' failed to satisfy constraint: 
                Member must satisfy regular expression pattern: .*(python|javascript|java)'`,
                name: 'ValidationException',
                time: new Date(),
            }
            const recommendationHandler = new RecommendationHandler()
            sinon.stub(recommendationHandler, 'getServerResponse').throws(awsError)
            const mockEditor = createMockTextEditor('#include <stdio.h>\n', 'test.c', 'c')
            assert.ok(!UnsupportedLanguagesCache.isUnsupportedProgrammingLanguage('c'))

            await recommendationHandler.getRecommendations(mockClient, mockEditor, 'AutoTrigger', config, 'Enter')

            assert.ok(UnsupportedLanguagesCache.isUnsupportedProgrammingLanguage('c'))
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
