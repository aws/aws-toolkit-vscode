/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as sinon from 'sinon'
import { InlineCompletionService, CWInlineCompletionItemProvider } from '../../../codewhisperer/service/inlineCompletionService'
import { createMockTextEditor, resetCodeWhispererGlobalVariables, createMockDocument } from '../testUtil'
import { ReferenceInlineProvider } from '../../../codewhisperer/service/referenceInlineProvider'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'
import * as codewhispererSdkClient from '../../../codewhisperer/client/codewhisperer'
import { ConfigurationEntry } from '../../../codewhisperer/models/model'
import { getTestWorkspaceFolder } from '../../../integrationTest/integrationTestsUtilities'
import { join } from 'path'

describe('inlineCompletionService', function () {
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })

    describe('getPaginatedRecommendation', function () {
        const config: ConfigurationEntry = {
            isShowMethodsEnabled: true,
            isManualTriggerEnabled: true,
            isAutomatedTriggerEnabled: true,
            isSuggestionsWithCodeReferencesEnabled: true,
        }

        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient

        beforeEach(function () {
            mockClient = new codewhispererSdkClient.DefaultCodeWhispererClient()
            resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should clear previous recommendation before showing inline recommendation', async function () {
            const mockEditor = createMockTextEditor()
            sinon.stub(RecommendationHandler.instance, 'getRecommendations').resolves()
            RecommendationHandler.instance.recommendations = [
                { content: "\n\t\tconsole.log('Hello world!');\n\t}" },
                { content: '' },
            ]
            await InlineCompletionService.instance.getPaginatedRecommendation(
                mockClient,
                mockEditor,
                'OnDemand',
                config
            )
            assert.strictEqual(RecommendationHandler.instance.recommendations.length, 0)
        })

        it('should call checkAndResetCancellationTokens before showing inline and next token to be null', async function () {
            const mockEditor = createMockTextEditor()
            sinon.stub(RecommendationHandler.instance, 'getRecommendations').resolves()
            const checkAndResetCancellationTokensStub = sinon.stub(
                RecommendationHandler.instance,
                'checkAndResetCancellationTokens'
            )
            RecommendationHandler.instance.recommendations = [
                { content: "\n\t\tconsole.log('Hello world!');\n\t}" },
                { content: '' },
            ]
            await InlineCompletionService.instance.getPaginatedRecommendation(
                mockClient,
                mockEditor,
                'OnDemand',
                config
            )
            assert.ok(checkAndResetCancellationTokensStub.called)
            assert.strictEqual(RecommendationHandler.instance.hasNextToken(), false)
        })
    })

    describe('clearInlineCompletionStates', function () {
        it('should remove inline reference and recommendations', async function () {
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
            RecommendationHandler.instance.recommendations = [
                { content: "\n\t\tconsole.log('Hello world!');\n\t}" },
                { content: '' },
            ]

            assert.ok(RecommendationHandler.instance.recommendations.length > 0)
            await InlineCompletionService.instance.clearInlineCompletionStates(createMockTextEditor())
            assert.strictEqual(ReferenceInlineProvider.instance.refs.length, 0)
            assert.strictEqual(RecommendationHandler.instance.recommendations.length, 0)
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
        })

        it('should remove inline reference onEditorChange', async function () {
            await InlineCompletionService.instance.onEditorChange()
            assert.strictEqual(ReferenceInlineProvider.instance.refs.length, 0)
        })
        it('should remove inline reference onFocusChange', async function () {
            await InlineCompletionService.instance.onFocusChange()
            assert.strictEqual(ReferenceInlineProvider.instance.refs.length, 0)
        })
        it('should not remove inline reference on cursor change from typing', async function () {
            await InlineCompletionService.instance.onCursorChange({
                textEditor: createMockTextEditor(),
                selections: [],
                kind: vscode.TextEditorSelectionChangeKind.Keyboard,
            })
            assert.strictEqual(ReferenceInlineProvider.instance.refs.length, 1)
        })

        it('should remove inline reference on cursor change from mouse movement', async function () {
            await InlineCompletionService.instance.onCursorChange({
                textEditor: vscode.window.activeTextEditor!,
                selections: [],
                kind: vscode.TextEditorSelectionChangeKind.Mouse,
            })
            assert.strictEqual(ReferenceInlineProvider.instance.refs.length, 0)
        })
    })

    describe('tryShowRecommendation', function () {
        let editor: vscode.TextEditor
        
        const config: ConfigurationEntry = {
            isShowMethodsEnabled: true,
            isManualTriggerEnabled: true,
            isAutomatedTriggerEnabled: true,
            isSuggestionsWithCodeReferencesEnabled: true,
        }

        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient

        beforeEach(async function () {
            mockClient = new codewhispererSdkClient.DefaultCodeWhispererClient()
            resetCodeWhispererGlobalVariables()
            const workspaceFolder = getTestWorkspaceFolder()
            const appRoot = join(workspaceFolder, 'python3.7-plain-sam-app')
            const appCodePath = join(appRoot, 'hello_world', 'app.py')
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(appCodePath))
            editor = await vscode.window.showTextDocument(doc) 
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should cancel paginated req, report user decision and clear recs if active selection pos is before RecommendationHandler start pos', async function () {
            sinon.stub(vscode.window, 'activeTextEditor').resolves(editor)
            const cancelPaginatedReqSpy = sinon.stub(RecommendationHandler.instance, 'cancelPaginatedRequest').resolves()
            const reportUserDecSpy = sinon.stub(RecommendationHandler.instance, 'reportUserDecisionOfRecommendation').resolves()
            const clearRecsSpy = sinon.stub(RecommendationHandler.instance, 'clearRecommendations').resolves()

            RecommendationHandler.instance.startPos = new vscode.Position(1, 1)
            //call getPaginatedRecommendation in order to set documentUri to editor path
            await InlineCompletionService.instance.getPaginatedRecommendation(
                mockClient,
                editor,
                'OnDemand',
                config
            )
            RecommendationHandler.instance.recommendations = [
                { content: "\n\t\tprint('Hello world!')\n\t}" },
                { content: '' },
            ]

            await InlineCompletionService.instance.tryShowRecommendation()
       
            assert.ok(cancelPaginatedReqSpy.called)
            assert.ok(reportUserDecSpy.called)
            assert.ok(clearRecsSpy.called)
        })
    })
})

describe('CWInlineCompletionProvider', function () {
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })

    describe('provideInlineCompletionItems', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should return undefined if position is before RecommendationHandler start pos', async function () {
            RecommendationHandler.instance.startPos = new vscode.Position(1, 1)
            const position = new vscode.Position(0, 0)
            const document = createMockDocument()
            const fakeContext = {triggerKind: 0, selectedCompletionInfo: undefined}
            const token = new vscode.CancellationTokenSource().token
            const provider = new CWInlineCompletionItemProvider(0, 0)
            const result = await provider.provideInlineCompletionItems(
                document,
                position,
                fakeContext,
                token
            )
          
            assert.ok(result === undefined)
        })
    })
})