/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as codewhispererSdkClient from '../../../codewhisperer/client/codewhisperer'
import { vsCodeState, ConfigurationEntry } from '../../../codewhisperer/models/model'
import { DocumentChangedHandler } from '../../../codewhisperer/service/DocumentChangedHandler'
import { InlineCompletion } from '../../../codewhisperer/service/inlineCompletion'
import {
    createMockTextEditor,
    createTextDocumentChangeEvent,
    resetCodeWhispererGlobalVariables,
    createMockDocument,
} from '../testUtil'
import * as EditorContext from '../../../codewhisperer/util/editorContext'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'

const performance = globalThis.performance ?? require('perf_hooks').performance

describe('DocumentChangedHandler', function () {
    const config: ConfigurationEntry = {
        isShowMethodsEnabled: true,
        isManualTriggerEnabled: true,
        isAutomatedTriggerEnabled: true,
        isIncludeSuggestionsWithCodeReferencesEnabled: true,
    }
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })
    describe('documentChanged', async function () {
        let invokeSpy: sinon.SinonStub
        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient
        beforeEach(function () {
            invokeSpy = sinon.stub(DocumentChangedHandler.instance, 'invokeAutomatedTrigger')
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
            const keyStrokeHandler = new DocumentChangedHandler()
            await keyStrokeHandler.documentChanged(mockEvent, mockEditor, mockClient, cfg)
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
            await DocumentChangedHandler.instance.documentChanged(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
        })

        it('Should not call invokeAutomatedTrigger when changed text across multiple lines', async function () {
            const mockEditor = createMockTextEditor()
            const v = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0))
            const t = v.isSingleLine
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)),
                '\nprint(n'
            )
            await DocumentChangedHandler.instance.documentChanged(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
        })

        it('Should not call invokeAutomatedTrigger when doing delete or undo (empty changed text)', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                ''
            )
            await DocumentChangedHandler.instance.documentChanged(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
        })

        it('Should not call invokeAutomatedTrigger if previous text input is within 2 seconds and it is not a specialcharacter trigger \n', async function () {
            DocumentChangedHandler.instance.keyStrokeCount = 14
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'a'
            )
            RecommendationHandler.instance.lastInvocationTime = performance.now() - 1500
            await DocumentChangedHandler.instance.documentChanged(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger with Enter when inputing \n', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '\n'
            )
            await DocumentChangedHandler.instance.documentChanged(mockEvent, mockEditor, mockClient, config)
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
            await DocumentChangedHandler.instance.documentChanged(mockEvent, mockEditor, mockClient, config)
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
            await DocumentChangedHandler.instance.documentChanged(mockEvent, mockEditor, mockClient, config)
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
            await DocumentChangedHandler.instance.documentChanged(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger with arg KeyStrokeCount when invocationContext.keyStrokeCount reaches threshold', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'a'
            )
            DocumentChangedHandler.instance.keyStrokeCount = 15
            await DocumentChangedHandler.instance.documentChanged(mockEvent, mockEditor, mockClient, config)
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
            DocumentChangedHandler.instance.keyStrokeCount = 8
            await DocumentChangedHandler.instance.documentChanged(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
            assert.strictEqual(DocumentChangedHandler.instance.keyStrokeCount, 9)
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
            const keyStrokeHandler = new DocumentChangedHandler()
            InlineCompletion.instance.setCodeWhispererStatusBarOk()
            const getRecommendationsStub = sinon.stub(InlineCompletion.instance, 'getPaginatedRecommendation')
            await keyStrokeHandler.invokeAutomatedTrigger('Enter', mockEditor, mockClient, config)
            assert.ok(getRecommendationsStub.calledOnce)
        })

        it('should reset invocationContext.keyStrokeCount to 0', async function () {
            const mockEditor = createMockTextEditor()
            DocumentChangedHandler.instance.keyStrokeCount = 10
            sinon
                .stub(RecommendationHandler.instance, 'getServerResponse')
                .resolves([{ content: 'import math' }, { content: 'def two_sum(nums, target):' }])
            await DocumentChangedHandler.instance.invokeAutomatedTrigger('Enter', mockEditor, mockClient, config)
            assert.strictEqual(DocumentChangedHandler.instance.keyStrokeCount, 0)
        })
    })
})
