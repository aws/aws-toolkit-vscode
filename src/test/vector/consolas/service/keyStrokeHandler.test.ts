/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as consolasSDkClient from '../../../../vector/consolas/client/consolas'
import { AWSError } from 'aws-sdk'
import { assertTelemetryCurried } from '../../../testUtil'
import { RecommendationsList } from '../../../../vector/consolas/client/consolasclient'
import {
    recommendations,
    invocationContext,
    automatedTriggerContext,
    telemetryContext,
} from '../../../../vector/consolas/models/model'
import * as KeyStrokeHandler from '../../../../vector/consolas/service/keyStrokeHandler'
import { createMockTextEditor, createTextDocumentChangeEvent, resetConsolasGlobalVariables } from '../testUtil'
import * as EditorContext from '../../../../vector/consolas/util/editorContext'
import { UnsupportedLanguagesCache } from '../../../../vector/consolas/util/unsupportedLanguagesCache'

const performance = require('perf_hooks') ? require('perf_hooks').performance : globalThis.performance

describe('keyStrokeHandler', function () {
    const isManualTriggerOn = true
    const isAutomatedTriggerOn = true
    beforeEach(function () {
        resetConsolasGlobalVariables()
    })
    describe('processKeyStroke', async function () {
        let invokeSpy: sinon.SinonStub
        let mockClient: consolasSDkClient.DefaultConsolasClient
        beforeEach(function () {
            invokeSpy = sinon.stub(KeyStrokeHandler, 'invokeAutomatedTrigger')
            sinon.spy(KeyStrokeHandler, 'getRecommendations')
            mockClient = new consolasSDkClient.DefaultConsolasClient()
        })
        afterEach(function () {
            sinon.restore()
        })

        it('Whatever the input is, should skip when automatic trigger is turned off, should not call invokeAutomatedTrigger', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                ' '
            )
            const isAutomatedTriggerEnabled = false
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerEnabled
            )
            assert.ok(!invokeSpy.called)
        })

        it('Should not call invokeAutomatedTrigger when changed text matches active recommendation prefix', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'd'
            )
            invocationContext.isActive = true
            invocationContext.startPos = new vscode.Position(1, 0)
            recommendations.response = [{ content: 'def two_sum(nums, target):\n for i in nums' }]
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            assert.ok(!invokeSpy.called)
        })

        it('Should not call invokeAutomatedTrigger when changed text across multiple lines', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)),
                'print(n'
            )
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            assert.ok(!invokeSpy.called)
        })

        it('Should not call invokeAutomatedTrigger when doing delete or undo (empty changed text)', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                ''
            )
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            assert.ok(!invokeSpy.called)
        })

        it('Should not call invokeAutomatedTrigger if previous text input is within 2 seconds \n', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '\n'
            )
            invocationContext.lastInvocationTime = performance.now() - 1500
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            assert.ok(!invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger with Enter when inputing \n', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '\n'
            )
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            invokeSpy('Enter', mockEditor, mockClient)
            assert.ok(invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger with SpecialCharacter when inputing {', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '{'
            )
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            invokeSpy('SpecialCharacters', mockEditor, mockClient)
            assert.ok(invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger with SpecialCharacter when inputing spaces equivalent to \t', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '  '
            )
            EditorContext.updateTabSize(2)
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            invokeSpy('SpecialCharacters', mockEditor, mockClient)
            assert.ok(invokeSpy.called)
        })

        it('Should not call invokeAutomatedTrigger with SpecialCharacter when inputing spaces not equivalent to \t', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '   '
            )
            EditorContext.updateTabSize(2)
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            assert.ok(!invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger with arg KeyStrokeCount when invocationContext.keyStrokeCount reaches threshold', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'a'
            )
            automatedTriggerContext.keyStrokeCount = 15
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            invokeSpy('KeyStrokeCount', mockEditor, mockClient)
            assert.ok(invokeSpy.called)
        })

        it('Should not call invokeAutomatedTrigger when user input is not special character and invocationContext.keyStrokeCount does not reach threshold, should increase invocationContext.keyStrokeCount by 1', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'a'
            )
            automatedTriggerContext.keyStrokeCount = 8
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            assert.ok(!invokeSpy.called)
            assert.strictEqual(automatedTriggerContext.keyStrokeCount, 9)
        })
    })

    describe('invokeAutomatedTrigger', function () {
        let mockClient: consolasSDkClient.DefaultConsolasClient
        beforeEach(function () {
            sinon.restore()
            mockClient = new consolasSDkClient.DefaultConsolasClient()
        })
        afterEach(function () {
            sinon.restore()
        })

        it('should call getRecommendations and assigns recommendations.response with its response', async function () {
            const mockEditor = createMockTextEditor()
            const getRecommendationsStub = sinon
                .stub(KeyStrokeHandler, 'getRecommendations')
                .resolves([{ content: 'import math' }, { content: 'def two_sum(nums, target):' }])
            await KeyStrokeHandler.invokeAutomatedTrigger(
                'Enter',
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn,
                getRecommendationsStub
            )
            assert.ok(getRecommendationsStub.calledOnce)
            assert.deepStrictEqual(recommendations.response, [
                { content: 'import math' },
                { content: 'def two_sum(nums, target):' },
            ])
        })

        it('should reset invocationContext.keyStrokeCount to 0', async function () {
            const mockEditor = createMockTextEditor()
            automatedTriggerContext.keyStrokeCount = 10
            const getRecommendationsStub = sinon.stub(KeyStrokeHandler, 'getRecommendations')
            await KeyStrokeHandler.invokeAutomatedTrigger(
                'Enter',
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn,
                getRecommendationsStub
            )
            assert.strictEqual(automatedTriggerContext.keyStrokeCount, 0)
        })

        it('should not executeCommand editor.action.triggerSuggest when recommendation does not match current code prefix', async function () {
            const mockEditor = createMockTextEditor()
            const getRecommendationStub = sinon.stub(KeyStrokeHandler, 'getRecommendations')
            const cmdSpy = sinon.spy(vscode.commands, 'executeCommand')
            await KeyStrokeHandler.invokeAutomatedTrigger(
                'Enter',
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn,
                getRecommendationStub
            )
            assert.ok(!cmdSpy.called)
        })
    })

    describe('checkPrefixMatchSuggestionAndUpdatePrefixMatchArray', function () {
        let mockClient: consolasSDkClient.DefaultConsolasClient
        afterEach(function () {
            sinon.restore()
        })
        const mockEditor = createMockTextEditor()
        it('should return false if text editor is undefined', async function () {
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                ' '
            )
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            assert.ok(telemetryContext.isPrefixMatched.length == 0)
        })

        it('should return false if recommendation is invalid', async function () {
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                ' '
            )
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            assert.ok(telemetryContext.isPrefixMatched.length == 0)
        })

        it('should return false if invocation line is different than active editor cursor line', async function () {
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                ' '
            )
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            invocationContext.startPos = new vscode.Position(0, 1)
            assert.ok(telemetryContext.isPrefixMatched.length == 0)
        })

        it('should return false if no recommendation matches editor prefix', async function () {
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                ' '
            )
            await KeyStrokeHandler.processKeyStroke(
                mockEvent,
                mockEditor,
                mockClient,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
            recommendations.response = [{ content: "\n\t\tconsole.log('Hello world!');\n\t}" }, { content: '' }]
            assert.ok(telemetryContext.isPrefixMatched.length == 0)
        })

        it('should return true if at least one recommendation matches editor prefix. invocationContext.isPrefixMatched only appends on new consolas request.', async function () {
            const mockEditor = createMockTextEditor()
            recommendations.response = [
                { content: 'import math\ndef two_sum(nums, target):\n' },
                { content: 'def two_sum(nums, target):\n for i in nums' },
            ]
            invocationContext.startPos = new vscode.Position(1, 0)
            let isPrefixMatched = KeyStrokeHandler.checkPrefixMatchSuggestionAndUpdatePrefixMatchArray(true, mockEditor)
            assert.deepStrictEqual(isPrefixMatched, [false, true])
            telemetryContext.isPrefixMatched = []
            isPrefixMatched = KeyStrokeHandler.checkPrefixMatchSuggestionAndUpdatePrefixMatchArray(false, mockEditor)
            assert.deepStrictEqual(isPrefixMatched, [])
        })
    })

    describe('getRecommendations', async function () {
        let mockClient: consolasSDkClient.DefaultConsolasClient
        const mockEditor = createMockTextEditor()

        beforeEach(function () {
            sinon.restore()
            resetConsolasGlobalVariables()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should assign correct recommendations and invocationContext given input', async function () {
            const mockServerResult = {
                recommendations: [{ content: "print('Hello World!')" }, { content: '' }],
                $response: {
                    requestId: 'test_request',
                },
            }
            const getServiceResponseStub = sinon.stub(KeyStrokeHandler, 'getServiceResponse').resolves(mockServerResult)
            const actual = await KeyStrokeHandler.getRecommendations(
                mockClient,
                mockEditor,
                'AutoTrigger',
                isManualTriggerOn,
                'Enter',
                getServiceResponseStub
            )
            const expected: RecommendationsList = [{ content: "print('Hello World!')" }, { content: '' }]
            assert.deepStrictEqual(actual, expected)
        })

        it('should assign request id and invocationContext correctly', async function () {
            const mockServerResult = {
                recommendations: [{ content: "print('Hello World!')" }, { content: '' }],
                $response: {
                    requestId: 'test_request',
                },
            }
            const getServiceResponseStub = sinon.stub(KeyStrokeHandler, 'getServiceResponse').resolves(mockServerResult)
            await KeyStrokeHandler.getRecommendations(
                mockClient,
                mockEditor,
                'AutoTrigger',
                isManualTriggerOn,
                'Enter',
                getServiceResponseStub
            )
            assert.strictEqual(recommendations.requestId, 'test_request')
            assert.strictEqual(telemetryContext.triggerType, 'AutoTrigger')
        })

        it('should call telemetry function that records a consolas service invocation', async function () {
            const mockServerResult = {
                recommendations: [{ content: "print('Hello World!')" }, { content: '' }],
                $response: {
                    requestId: 'test_request',
                },
            }
            const getServiceResponseStub = sinon.stub(KeyStrokeHandler, 'getServiceResponse').resolves(mockServerResult)
            sinon.stub(performance, 'now').returns(0.0)
            invocationContext.startPos = new vscode.Position(1, 0)
            telemetryContext.cursorOffset = 2
            await KeyStrokeHandler.getRecommendations(
                mockClient,
                mockEditor,
                'AutoTrigger',
                isManualTriggerOn,
                'Enter',
                getServiceResponseStub
            )
            const assertTelemetry = assertTelemetryCurried('consolas_serviceInvocation')
            assertTelemetry({
                consolasRequestId: 'test_request',
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
            const getServiceResponseStub = sinon.stub(KeyStrokeHandler, 'getServiceResponse').throws(awsError)
            const mockEditor = createMockTextEditor('#include <stdio.h>\n', 'test.c', 'c')
            assert.ok(!UnsupportedLanguagesCache.isUnsupportedProgrammingLanguage('c'))
            await KeyStrokeHandler.getRecommendations(
                mockClient,
                mockEditor,
                'AutoTrigger',
                isManualTriggerOn,
                'Enter',
                getServiceResponseStub
            )
            assert.ok(UnsupportedLanguagesCache.isUnsupportedProgrammingLanguage('c'))
        })
    })

    describe('isValidResponse', function () {
        afterEach(function () {
            sinon.restore()
        })
        it('should return true if any response is not empty', function () {
            const mockNormalRecommendationList: RecommendationsList = [
                {
                    content:
                        '\n    // Use the console to output debug info…n of the command with the "command" variable',
                },
                { content: '' },
            ]
            assert.ok(KeyStrokeHandler.isValidResponse(mockNormalRecommendationList))
        })

        it('should return false if response is empty', function () {
            const mockEmptyRecommendationList: RecommendationsList = []
            assert.ok(!KeyStrokeHandler.isValidResponse(mockEmptyRecommendationList))
        })

        it('should return false if all response has no string length', function () {
            const mockEmptyContentRecommendationList: RecommendationsList = [{ content: '' }, { content: '' }]
            assert.ok(!KeyStrokeHandler.isValidResponse(mockEmptyContentRecommendationList))
        })
    })
})
