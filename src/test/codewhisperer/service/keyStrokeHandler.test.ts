/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as codewhispererSdkClient from '../../../codewhisperer/client/codewhisperer'
import { vsCodeState, ConfigurationEntry } from '../../../codewhisperer/models/model'
import { KeyStrokeHandler } from '../../../codewhisperer/service/keyStrokeHandler'
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
        isIncludeSuggestionsWithCodeReferencesEnabled: true,
    }
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })
    describe('processKeyStroke', async function () {
        let invokeSpy: sinon.SinonStub
        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient
        beforeEach(function () {
            invokeSpy = sinon.stub(KeyStrokeHandler.instance, 'invokeAutomatedTrigger')
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
                isIncludeSuggestionsWithCodeReferencesEnabled: true,
            }
            const keyStrokeHandler = new KeyStrokeHandler()
            await keyStrokeHandler.processKeyStroke(mockEvent, mockEditor, mockClient, cfg)
            assert.ok(!invokeSpy.called)
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
        })

        it('Should not call invokeAutomatedTrigger if previous text input is within 2 seconds and it is not a specialcharacter trigger \n', async function () {
            KeyStrokeHandler.instance.keyStrokeCount = 14
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'a'
            )
            RecommendationHandler.instance.lastInvocationTime = performance.now() - 1500
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
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

        it('Should call invokeAutomatedTrigger with arg KeyStrokeCount when invocationContext.keyStrokeCount reaches threshold', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'a'
            )
            KeyStrokeHandler.instance.keyStrokeCount = 15
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            invokeSpy('KeyStrokeCount', mockEditor, mockClient)
            assert.ok(invokeSpy.called)
        })

        it('Should not call invokeAutomatedTrigger when user input is not special character and keyStrokeCount does not reach threshold, should increase invocationContext.keyStrokeCount by 1', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'a'
            )
            RecommendationHandler.instance.lastInvocationTime = 0
            KeyStrokeHandler.instance.keyStrokeCount = 8
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
            assert.strictEqual(KeyStrokeHandler.instance.keyStrokeCount, 9)
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

        it('should reset invocationContext.keyStrokeCount to 0', async function () {
            const mockEditor = createMockTextEditor()
            KeyStrokeHandler.instance.keyStrokeCount = 10
            sinon
                .stub(RecommendationHandler.instance, 'getServerResponse')
                .resolves([{ content: 'import math' }, { content: 'def two_sum(nums, target):' }])
            await KeyStrokeHandler.instance.invokeAutomatedTrigger('Enter', mockEditor, mockClient, config)
            assert.strictEqual(KeyStrokeHandler.instance.keyStrokeCount, 0)
        })
    })

    describe('test SingleChange.checkChangeSource')
})
