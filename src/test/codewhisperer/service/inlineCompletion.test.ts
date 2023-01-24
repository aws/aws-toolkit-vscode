/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as sinon from 'sinon'
import { InlineCompletion } from '../../../codewhisperer/service/inlineCompletion'
import { createMockTextEditor, resetCodeWhispererGlobalVariables } from '../testUtil'
import { ConfigurationEntry, vsCodeState } from '../../../codewhisperer/models/model'
import * as codewhispererSdkClient from '../../../codewhisperer/client/codewhisperer'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import globals from '../../../shared/extensionGlobals'

describe('inlineCompletion', function () {
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })
    describe('resetInlineStates', async function () {
        it('should reset inline arrays and length be 0', async function () {
            const mockEditor = createMockTextEditor()
            // Set values to some
            InlineCompletion.instance.items = [
                { content: 'def two_sum(nums, target):\n for i in nums', index: 1 },
                { content: 'def two_sum(x, y):\n return x + y', index: 2 },
            ]
            InlineCompletion.instance.origin = [{ content: 'def two_sum(nums, target):\n for i in nums' }]
            InlineCompletion.instance.position = 1
            await InlineCompletion.instance.resetInlineStates(mockEditor)
            assert.strictEqual(InlineCompletion.instance.items.length, 0)
            assert.strictEqual(InlineCompletion.instance.origin.length, 0)
            assert.strictEqual(InlineCompletion.instance.position, 0)
        })
    })

    describe('acceptRecommendation', async function () {
        let invokeSpy: sinon.SinonStub

        afterEach(function () {
            sinon.restore()
        })

        it('should not call editor.edit when CodeWhisperer is editing', async function () {
            const mockEditor = createMockTextEditor()
            invokeSpy = sinon.stub(mockEditor, 'edit')
            // Set isCodeWhispererEditing to true
            vsCodeState.isCodeWhispererEditing = true
            await InlineCompletion.instance.acceptRecommendation(mockEditor)
            assert.ok(!invokeSpy.called)
            // Set it back to false
            vsCodeState.isCodeWhispererEditing = false
        })

        it('should reset CodeWhispererConstants.serviceActiveKey after acceptance', async function () {
            const mockEditor = createMockTextEditor()
            invokeSpy = sinon.stub(mockEditor, 'edit').resolves()
            InlineCompletion.instance.items = [
                { content: 'def two_sum(nums, target):\n for i in nums', index: 1 },
                { content: 'def two_sum(x, y):\n return x + y', index: 2 },
            ]
            InlineCompletion.instance.origin = [
                { content: 'def two_sum(nums, target):\n for i in nums' },
                { content: 'def two_sum(x, y):\n return x + y' },
            ]
            await vscode.commands.executeCommand('setContext', CodeWhispererConstants.serviceActiveKey, true)
            InlineCompletion.instance.position = 0
            const mockPosition = new vscode.Position(0, 0)
            InlineCompletion.instance.setRange(new vscode.Range(mockPosition, mockPosition))
            await InlineCompletion.instance.acceptRecommendation(mockEditor)
            const ServiceKey =
                globals.context.globalState.get<boolean>(CodeWhispererConstants.serviceActiveKey) || false
            assert.ok(invokeSpy.called)
            assert.strictEqual(ServiceKey, false)
        })
    })

    describe('rejectRecommendation', async function () {
        let invokeSpy: sinon.SinonStub
        afterEach(function () {
            sinon.restore()
            InlineCompletion.instance.items = [
                { content: 'def two_sum(nums, target):\n for i in nums', index: 1 },
                { content: 'def two_sum(x, y):\n return x + y', index: 2 },
            ]
            InlineCompletion.instance.origin = [
                { content: 'def two_sum(nums, target):\n for i in nums' },
                { content: 'def two_sum(x, y):\n return x + y' },
            ]
            InlineCompletion.instance.position = 0
        })

        it('should not call editor.edit when CodeWhisperer is editing', async function () {
            const mockEditor = createMockTextEditor()
            invokeSpy = sinon.stub(mockEditor, 'edit')
            // Set isCodeWhispererEditing to true
            vsCodeState.isCodeWhispererEditing = true
            await InlineCompletion.instance.rejectRecommendation(mockEditor)
            assert.ok(!invokeSpy.called)
            // Set it back to false
            vsCodeState.isCodeWhispererEditing = false
        })

        it('should reset CodeWhispererConstants.serviceActiveKey after rejectRecommendation', async function () {
            const mockEditor = createMockTextEditor()
            invokeSpy = sinon.stub(mockEditor, 'edit').resolves()
            const mockPosition = new vscode.Position(0, 0)
            InlineCompletion.instance.setRange(new vscode.Range(mockPosition, mockPosition))
            await vscode.commands.executeCommand('setContext', CodeWhispererConstants.serviceActiveKey, true)
            await InlineCompletion.instance.rejectRecommendation(mockEditor)
            const ServiceKey =
                globals.context.globalState.get<boolean>(CodeWhispererConstants.serviceActiveKey) || false
            assert.ok(invokeSpy.called)
            assert.strictEqual(ServiceKey, false)
        })

        it('should call cancelPaginatedRequest once when reject is successful', async function () {
            const mockEditor = createMockTextEditor()
            invokeSpy = sinon.stub(RecommendationHandler.instance, 'cancelPaginatedRequest')
            const mockPosition = new vscode.Position(0, 0)
            InlineCompletion.instance.setRange(new vscode.Range(mockPosition, mockPosition))
            await InlineCompletion.instance.rejectRecommendation(mockEditor)
            assert.ok(invokeSpy.calledOnce)
        })
    })

    describe('setTypeAheadRecommendations', async function () {
        let invokeSpy: sinon.SinonStub

        afterEach(function () {
            sinon.restore()
            InlineCompletion.instance.items = [
                { content: 'def two_sum(nums, target):\n for i in nums', index: 1 },
                { content: 'two_sum(x, y):\n return x + y', index: 2 },
            ]
            InlineCompletion.instance.origin = [
                { content: 'def two_sum(nums, target):\n for i in nums' },
                { content: 'two_sum(x, y):\n return x + y' },
            ]
            InlineCompletion.instance.position = 0
            RecommendationHandler.instance.startPos = new vscode.Position(0, 0)
        })

        it('should not call getTypedPrefix when recommendation are null', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'd'
            )
            invokeSpy = sinon.stub(InlineCompletion.instance, 'getTypedPrefix')
            InlineCompletion.instance.origin = []
            await InlineCompletion.instance.setTypeAheadRecommendations(mockEditor, mockEvent)
            assert.ok(!invokeSpy.called)
        })

        it('should set items to 1 when typedPrefix matches', async function () {
            const mockEditor = createMockTextEditor(
                'def two_sum(nums, target):\n for i in nums',
                'test.py',
                'python',
                0,
                0
            )
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'd'
            )
            mockEditor.selection.active = new vscode.Position(0, 1)
            await InlineCompletion.instance.setTypeAheadRecommendations(mockEditor, mockEvent)
            assert.strictEqual(InlineCompletion.instance.items.length, 1)
        })

        it('should call rejectRecommendation when typedPrefix does not match', async function () {
            const mockEditor = createMockTextEditor('if', 'test.py', 'python', 0, 0)
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'd'
            )
            invokeSpy = sinon.stub(InlineCompletion.instance, 'rejectRecommendation')
            mockEditor.selection.active = new vscode.Position(0, 1)
            await InlineCompletion.instance.setTypeAheadRecommendations(mockEditor, mockEvent)
            assert.ok(invokeSpy.called)
        })
    })

    describe('getPaginatedRecommendation', function () {
        const config: ConfigurationEntry = {
            isShowMethodsEnabled: true,
            isManualTriggerEnabled: true,
            isAutomatedTriggerEnabled: true,
            isSuggestionsWithCodeReferencesEnabled: true,
        }
        const invokeSpy = sinon.stub(RecommendationHandler.instance, 'getRecommendations')
        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient
        beforeEach(function () {
            mockClient = new codewhispererSdkClient.DefaultCodeWhispererClient()
            resetCodeWhispererGlobalVariables()
        })
        it('should call clear Recommendation before showing inline recommendation', async function () {
            const mockEditor = createMockTextEditor()
            invokeSpy.resolves()
            const clearRecommendationStub = sinon.stub(RecommendationHandler.instance, 'clearRecommendations')
            RecommendationHandler.instance.recommendations = [
                { content: "\n\t\tconsole.log('Hello world!');\n\t}" },
                { content: '' },
            ]
            InlineCompletion.instance.getPaginatedRecommendation(mockClient, mockEditor, 'OnDemand', config)
            assert.ok(clearRecommendationStub.called)
        })
        it('should call checkAndResetCancellationTokens before showing inline and next token to be null', async function () {
            const mockEditor = createMockTextEditor()
            invokeSpy.resolves()
            const checkAndResetCancellationTokensStub = sinon.stub(
                RecommendationHandler.instance,
                'checkAndResetCancellationTokens'
            )
            RecommendationHandler.instance.recommendations = [
                { content: "\n\t\tconsole.log('Hello world!');\n\t}" },
                { content: '' },
            ]
            InlineCompletion.instance.getPaginatedRecommendation(mockClient, mockEditor, 'OnDemand', config)

            assert.ok(checkAndResetCancellationTokensStub.called)
            assert.strictEqual(RecommendationHandler.instance.hasNextToken(), false)
        })
    })

    describe('navigateRecommendation', async function () {
        let invokeSpy: sinon.SinonStub

        beforeEach(function () {
            sinon.restore()
            InlineCompletion.instance.items = [
                { content: 'def two_sum(nums, target):\n for i in nums', index: 1 },
                { content: 'two_sum(x, y):\n return x + y', index: 2 },
            ]
            InlineCompletion.instance.origin = [
                { content: 'def two_sum(nums, target):\n for i in nums' },
                { content: 'two_sum(x, y):\n return x + y' },
            ]
            InlineCompletion.instance.position = 0
        })

        it('should not call showRecommendation when CodeWhisperer is editing', async function () {
            const mockEditor = createMockTextEditor()
            // sinon.restore()
            invokeSpy = sinon.stub(InlineCompletion.instance, 'showRecommendation')
            // Set isCodeWhispererEditing to true
            vsCodeState.isCodeWhispererEditing = true
            await InlineCompletion.instance.navigateRecommendation(mockEditor, true)
            assert.ok(!invokeSpy.called)
            // Set it back to false
            vsCodeState.isCodeWhispererEditing = false
        })
        it('should set position to 1 when called with next', async function () {
            const mockEditor = createMockTextEditor()
            // sinon.restore()
            invokeSpy = sinon.stub(InlineCompletion.instance, 'showRecommendation')
            await InlineCompletion.instance.navigateRecommendation(mockEditor, true)
            assert.strictEqual(InlineCompletion.instance.position, 1)
            assert.ok(invokeSpy.called)
        })

        it('should set position to 0 when called with next as false', async function () {
            const mockEditor = createMockTextEditor()
            // sinon.restore()
            invokeSpy = sinon.stub(InlineCompletion.instance, 'showRecommendation')
            InlineCompletion.instance.position = 1
            await InlineCompletion.instance.navigateRecommendation(mockEditor, false)
            assert.strictEqual(InlineCompletion.instance.position, 0)
            assert.ok(invokeSpy.called)
        })

        it('should check no circular navigation when previous is pressed', async function () {
            const mockEditor = createMockTextEditor()
            // sinon.restore()
            invokeSpy = sinon.stub(InlineCompletion.instance, 'showRecommendation')
            await InlineCompletion.instance.navigateRecommendation(mockEditor, false)
            assert.strictEqual(InlineCompletion.instance.position, 0)
            // If position is not changed then showRecommendation shuuld not be called
            assert.ok(!invokeSpy.called)
        })

        it('should check no circular navigation when next is pressed', async function () {
            const mockEditor = createMockTextEditor()
            // sinon.restore()
            invokeSpy = sinon.stub(InlineCompletion.instance, 'showRecommendation')
            InlineCompletion.instance.position = 1
            await InlineCompletion.instance.navigateRecommendation(mockEditor, true)
            assert.strictEqual(InlineCompletion.instance.position, 1)
            assert.ok(!invokeSpy.called)
        })
    })
})

export function createTextDocumentChangeEvent(document: vscode.TextDocument, range: vscode.Range, text: string) {
    return {
        document: document,
        contentChanges: [
            {
                range: range,
                rangeOffset: 1,
                rangeLength: 1,
                text: text,
            },
        ],
    }
}
