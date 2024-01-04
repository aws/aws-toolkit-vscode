/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { DefaultCodeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import { assertTelemetryCurried } from '../../testUtil'
import { RecommendationsList } from '../../../codewhisperer/client/codewhisperer'
import { ConfigurationEntry } from '../../../codewhisperer/models/model'
import { createMockTextEditor, resetCodeWhispererGlobalVariables } from '../testUtil'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'
import { stub } from '../../utilities/stubber'
import { CodeWhispererCodeCoverageTracker } from '../../../codewhisperer/tracker/codewhispererCodeCoverageTracker'
import { FakeMemento } from '../../fakeExtensionContext'
import * as supplementalContextUtil from '../../../codewhisperer/util/supplementalContext/supplementalContextUtil'
import globals from '../../../shared/extensionGlobals'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import { CodeWhispererUserGroupSettings } from '../../../codewhisperer/util/userGroupUtil'
import { extensionVersion } from '../../../shared/vscode/env'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { session } from '../../../codewhisperer/util/codeWhispererSession'
import { ReferenceInlineProvider } from '../../../codewhisperer/service/referenceInlineProvider'

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
        const testStartUrl = 'testStartUrl'

        beforeEach(function () {
            sinon.restore()
            resetCodeWhispererGlobalVariables()
            mockClient.listRecommendations.resolves({})
            mockClient.generateRecommendations.resolves({})
            RecommendationHandler.instance.clearRecommendations()
            sinon.stub(AuthUtil.instance, 'startUrl').value(testStartUrl)
        })

        afterEach(function () {
            sinon.restore()
            CodeWhispererUserGroupSettings.instance.reset()
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
            const actual = session.recommendations
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
            sinon.stub(handler, 'isCancellationRequested').returns(false)
            await handler.getRecommendations(mockClient, mockEditor, 'AutoTrigger', config, 'Enter', false)
            assert.strictEqual(handler.requestId, 'test_request')
            assert.strictEqual(session.sessionId, 'test_request')
            assert.strictEqual(session.triggerType, 'AutoTrigger')
        })

        it('should call telemetry function that records a CodeWhisperer service invocation', async function () {
            await globals.context.globalState.update(CodeWhispererConstants.userGroupKey, {
                group: CodeWhispererConstants.UserGroup.CrossFile,
                version: extensionVersion,
            })

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
            sinon.stub(supplementalContextUtil, 'fetchSupplementalContext').resolves({
                isUtg: false,
                isProcessTimeout: false,
                supplementalContextItems: [],
                contentsLength: 100,
                latency: 0,
                strategy: 'Empty',
            })
            sinon.stub(performance, 'now').returns(0.0)
            session.startPos = new vscode.Position(1, 0)
            session.startCursorOffset = 2
            await handler.getRecommendations(mockClient, mockEditor, 'AutoTrigger', config, 'Enter')
            const assertTelemetry = assertTelemetryCurried('codewhisperer_serviceInvocation')
            assertTelemetry({
                codewhispererRequestId: 'test_request',
                codewhispererSessionId: 'test_request',
                codewhispererLastSuggestionIndex: 1,
                codewhispererTriggerType: 'AutoTrigger',
                codewhispererAutomatedTriggerType: 'Enter',
                codewhispererImportRecommendationEnabled: true,
                result: 'Succeeded',
                codewhispererLineNumber: 1,
                codewhispererCursorOffset: 38,
                codewhispererLanguage: 'python',
                credentialStartUrl: testStartUrl,
                codewhispererSupplementalContextIsUtg: false,
                codewhispererSupplementalContextTimeout: false,
                codewhispererSupplementalContextLatency: 0,
                codewhispererSupplementalContextLength: 100,
                codewhispererUserGroup: 'CrossFile',
            })
        })

        it('should call telemetry function that records a Empty userDecision event', async function () {
            await globals.context.globalState.update(CodeWhispererConstants.userGroupKey, {
                group: CodeWhispererConstants.UserGroup.CrossFile,
                version: extensionVersion,
            })

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
            session.startPos = new vscode.Position(1, 0)
            session.requestIdList = ['test_request_empty']
            session.startCursorOffset = 2
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
                credentialStartUrl: testStartUrl,
                codewhispererUserGroup: 'CrossFile',
            })
        })
    })

    describe('isValidResponse', function () {
        afterEach(function () {
            sinon.restore()
        })
        it('should return true if any response is not empty', function () {
            const handler = new RecommendationHandler()
            session.recommendations = [
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
            session.recommendations = []
            assert.ok(!handler.isValidResponse())
        })

        it('should return false if all response has no string length', function () {
            const handler = new RecommendationHandler()
            session.recommendations = [{ content: '' }, { content: '' }]
            assert.ok(!handler.isValidResponse())
        })
    })

    describe('setCompletionType/getCompletionType', function () {
        beforeEach(function () {
            sinon.restore()
        })

        it('should set the completion type to block given a multi-line suggestion', function () {
            session.setCompletionType(0, { content: 'test\n\n   \t\r\nanother test' })
            assert.strictEqual(session.getCompletionType(0), 'Block')

            session.setCompletionType(0, { content: 'test\ntest\n' })
            assert.strictEqual(session.getCompletionType(0), 'Block')

            session.setCompletionType(0, { content: '\n   \t\r\ntest\ntest' })
            assert.strictEqual(session.getCompletionType(0), 'Block')
        })

        it('should set the completion type to line given a single-line suggestion', function () {
            session.setCompletionType(0, { content: 'test' })
            assert.strictEqual(session.getCompletionType(0), 'Line')

            session.setCompletionType(0, { content: 'test\r\t   ' })
            assert.strictEqual(session.getCompletionType(0), 'Line')
        })

        it('should set the completion type to line given a multi-line completion but only one-lien of non-blank sequence', function () {
            session.setCompletionType(0, { content: 'test\n\t' })
            assert.strictEqual(session.getCompletionType(0), 'Line')

            session.setCompletionType(0, { content: 'test\n    ' })
            assert.strictEqual(session.getCompletionType(0), 'Line')

            session.setCompletionType(0, { content: 'test\n\r' })
            assert.strictEqual(session.getCompletionType(0), 'Line')

            session.setCompletionType(0, { content: '\n\n\n\ntest' })
            assert.strictEqual(session.getCompletionType(0), 'Line')
        })
    })

    describe('on event change', async function () {
        beforeEach(function () {
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
            ReferenceInlineProvider.instance.setInlineReference(1, 'test', fakeReferences)
            session.sessionId = ''
            RecommendationHandler.instance.requestId = ''
        })

        it('should remove inline reference onEditorChange', async function () {
            session.sessionId = 'aSessionId'
            RecommendationHandler.instance.requestId = 'aRequestId'
            await RecommendationHandler.instance.onEditorChange()
            assert.strictEqual(ReferenceInlineProvider.instance.refs.length, 0)
        })
        it('should remove inline reference onFocusChange', async function () {
            session.sessionId = 'aSessionId'
            RecommendationHandler.instance.requestId = 'aRequestId'
            await RecommendationHandler.instance.onFocusChange()
            assert.strictEqual(ReferenceInlineProvider.instance.refs.length, 0)
        })
        it('should not remove inline reference on cursor change from typing', async function () {
            await RecommendationHandler.instance.onCursorChange({
                textEditor: createMockTextEditor(),
                selections: [],
                kind: vscode.TextEditorSelectionChangeKind.Keyboard,
            })
            assert.strictEqual(ReferenceInlineProvider.instance.refs.length, 1)
        })

        it('should remove inline reference on cursor change from mouse movement', async function () {
            await RecommendationHandler.instance.onCursorChange({
                textEditor: vscode.window.activeTextEditor!,
                selections: [],
                kind: vscode.TextEditorSelectionChangeKind.Mouse,
            })
            assert.strictEqual(ReferenceInlineProvider.instance.refs.length, 0)
        })
    })
})
