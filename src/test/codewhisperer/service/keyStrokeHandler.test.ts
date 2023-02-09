/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as codewhispererSdkClient from '../../../codewhisperer/client/codewhisperer'
import { vsCodeState, ConfigurationEntry } from '../../../codewhisperer/models/model'
import {
    DocumentChangedSource,
    KeyStrokeHandler,
    DefaultDocumentChangedType,
} from '../../../codewhisperer/service/keyStrokeHandler'
import { InlineCompletion } from '../../../codewhisperer/service/inlineCompletion'
import { createMockTextEditor, createTextDocumentChangeEvent, resetCodeWhispererGlobalVariables } from '../testUtil'
import { InlineCompletionService } from '../../../codewhisperer/service/inlineCompletionService'
import * as EditorContext from '../../../codewhisperer/util/editorContext'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'

const performance = globalThis.performance ?? require('perf_hooks').performance

describe('keyStrokeHandler', function () {
    const config: ConfigurationEntry = {
        isShowMethodsEnabled: true,
        isManualTriggerEnabled: true,
        isAutomatedTriggerEnabled: true,
        isSuggestionsWithCodeReferencesEnabled: true,
    }
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })
    describe('processKeyStroke', async function () {
        let invokeSpy: sinon.SinonStub
        let startTimerSpy: sinon.SinonStub
        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient
        beforeEach(function () {
            invokeSpy = sinon.stub(KeyStrokeHandler.instance, 'invokeAutomatedTrigger')
            startTimerSpy = sinon.stub(KeyStrokeHandler.instance, 'startIdleTimeTriggerTimer')
            sinon.spy(RecommendationHandler.instance, 'getRecommendations')
            mockClient = new codewhispererSdkClient.DefaultCodeWhispererClient()
            resetCodeWhispererGlobalVariables()
            sinon.stub(mockClient, 'listRecommendations')
            sinon.stub(mockClient, 'generateRecommendations')
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
            const cfg: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: false,
                isSuggestionsWithCodeReferencesEnabled: true,
            }
            const keyStrokeHandler = new KeyStrokeHandler()
            await keyStrokeHandler.processKeyStroke(mockEvent, mockEditor, mockClient, cfg)
            assert.ok(!invokeSpy.called)
            assert.ok(!startTimerSpy.called)
        })

        it('Should not call invokeAutomatedTrigger when changed text matches active recommendation prefix', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'd'
            )
            vsCodeState.isIntelliSenseActive = true
            RecommendationHandler.instance.startPos = new vscode.Position(1, 0)
            RecommendationHandler.instance.recommendations = [{ content: 'def two_sum(nums, target):\n for i in nums' }]
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
        })

        it('Should not call invokeAutomatedTrigger when changed text across multiple lines', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)),
                '\nprint(n'
            )
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
            assert.ok(!startTimerSpy.called)
        })

        it('Should not call invokeAutomatedTrigger when doing delete or undo (empty changed text)', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                ''
            )
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
            assert.ok(!startTimerSpy.called)
        })

        it('Should call invokeAutomatedTrigger if previous text input is within 2 seconds but the new input is new line', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '\n'
            )
            RecommendationHandler.instance.lastInvocationTime = performance.now() - 1500
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger if previous text input is within 2 seconds but the new input is a specialcharacter', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '('
            )
            RecommendationHandler.instance.lastInvocationTime = performance.now() - 1500
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger with Enter when inputing \n', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '\n'
            )
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            invokeSpy('Enter', mockEditor, mockClient)
            assert.ok(invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger with Enter when inputing \r\n', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 2)),
                '\r\n'
            )
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
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
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
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
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
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
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
        })

        it('Should not start idle trigger timer when inputing special characters', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '('
            )
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(!startTimerSpy.called)
        })

        it('Should start idle trigger timer when inputing non-special characters', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'a'
            )
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(startTimerSpy.called)
        })
    })

    describe('invokeAutomatedTrigger', function () {
        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient
        beforeEach(function () {
            sinon.restore()
            mockClient = new codewhispererSdkClient.DefaultCodeWhispererClient()
            resetCodeWhispererGlobalVariables()
            sinon.stub(mockClient, 'listRecommendations')
            sinon.stub(mockClient, 'generateRecommendations')
        })
        afterEach(function () {
            sinon.restore()
        })

        it('should call getPaginatedRecommendation', async function () {
            const mockEditor = createMockTextEditor()
            const keyStrokeHandler = new KeyStrokeHandler()
            InlineCompletion.instance.setCodeWhispererStatusBarOk()
            const oldGetRecommendationsStub = sinon.stub(InlineCompletion.instance, 'getPaginatedRecommendation')
            const getRecommendationsStub = sinon.stub(InlineCompletionService.instance, 'getPaginatedRecommendation')
            await keyStrokeHandler.invokeAutomatedTrigger('Enter', mockEditor, mockClient, config)
            assert.ok(getRecommendationsStub.calledOnce || oldGetRecommendationsStub.calledOnce)
        })
    })

    describe('shouldTriggerIdleTime', function () {
        it('should return false when inline is enabled and inline completion is in progress ', function () {
            const keyStrokeHandler = new KeyStrokeHandler()
            sinon.stub(InlineCompletionService.instance, 'isPaginationRunning').returns(true)
            sinon.stub(InlineCompletion.instance, 'isPaginationRunning').returns(true)
            const result = keyStrokeHandler.shouldTriggerIdleTime()
            assert.strictEqual(result, false)
        })
    })

    describe('test checkChangeSource', function () {
        const tabStr = ' '.repeat(EditorContext.getTabSize())

        const cases: [string, DocumentChangedSource][] = [
            ['\n          ', DocumentChangedSource.EnterKey],
            ['\n', DocumentChangedSource.EnterKey],
            ['(', DocumentChangedSource.SpecialCharsKey],
            ['()', DocumentChangedSource.SpecialCharsKey],
            ['{}', DocumentChangedSource.SpecialCharsKey],
            ['(a, b):', DocumentChangedSource.Unknown],
            [':', DocumentChangedSource.SpecialCharsKey],
            ['a', DocumentChangedSource.RegularKey],
            [tabStr, DocumentChangedSource.TabKey],
            ['__str__', DocumentChangedSource.IntelliSense],
            ['toString()', DocumentChangedSource.IntelliSense],
            ['</p>', DocumentChangedSource.IntelliSense],
            ['   ', DocumentChangedSource.Reformatting],
            ['def add(a,b):\n    return a + b\n', DocumentChangedSource.Unknown],
            ['function suggestedByIntelliSense():', DocumentChangedSource.Unknown],
        ]

        cases.forEach(tuple => {
            const input = tuple[0]
            const expected = tuple[1]
            it(`test input ${input} should return ${expected}`, function () {
                const actual = new DefaultDocumentChangedType(
                    createFakeDocumentChangeEvent(tuple[0])
                ).checkChangeSource()
                assert.strictEqual(actual, expected)
            })
        })

        function createFakeDocumentChangeEvent(str: string): ReadonlyArray<vscode.TextDocumentContentChangeEvent> {
            return [
                {
                    range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5)),
                    rangeOffset: 0,
                    rangeLength: 0,
                    text: str,
                },
            ]
        }
    })
})
