/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as sinon from 'sinon'
import { InlineCompletionService } from '../../../codewhisperer/service/inlineCompletionService'
import { createMockTextEditor, resetCodeWhispererGlobalVariables, createReferenceProvider } from '../testUtil'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'
import * as codewhispererSdkClient from '../../../codewhisperer/client/codewhisperer'
import { ConfigurationEntry } from '../../../codewhisperer/models/model'

describe('inlineCompletionService', function () {
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })

    describe('getPaginatedRecommendation', function () {
        const config: ConfigurationEntry = {
            isShowMethodsEnabled: true,
            isManualTriggerEnabled: true,
            isAutomatedTriggerEnabled: true,
            isIncludeSuggestionsWithCodeReferencesEnabled: true,
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
            const referenceProvider = createReferenceProvider()
            InlineCompletionService.instance.setReferenceInlineProvider(referenceProvider)
            RecommendationHandler.instance.recommendations = [
                { content: "\n\t\tconsole.log('Hello world!');\n\t}" },
                { content: '' },
            ]
            await InlineCompletionService.instance.clearInlineCompletionStates(createMockTextEditor())
            assert.strictEqual(referenceProvider.refs.length, 0)
            assert.strictEqual(RecommendationHandler.instance.recommendations.length, 0)
        })
    })

    describe('on event change', async function () {
        it('should remove inline reference onEditorChange', async function () {
            const referenceProvider = createReferenceProvider()
            InlineCompletionService.instance.setReferenceInlineProvider(referenceProvider)
            await InlineCompletionService.instance.onEditorChange()
            assert.strictEqual(referenceProvider.refs.length, 0)
        })
        it('should remove inline reference onFocusChange', async function () {
            const referenceProvider = createReferenceProvider()
            InlineCompletionService.instance.setReferenceInlineProvider(referenceProvider)
            await InlineCompletionService.instance.onFocusChange()
            assert.strictEqual(referenceProvider.refs.length, 0)
        })
        it('should not remove inline reference on cursor change from typing', async function () {
            const referenceProvider = createReferenceProvider()
            InlineCompletionService.instance.setReferenceInlineProvider(referenceProvider)
            await InlineCompletionService.instance.onCursorChange({
                textEditor: createMockTextEditor(),
                selections: [],
                kind: vscode.TextEditorSelectionChangeKind.Keyboard,
            })
            assert.strictEqual(referenceProvider.refs.length, 1)
        })

        it('should remove inline reference on cursor change from mouse movement', async function () {
            const referenceProvider = createReferenceProvider()
            InlineCompletionService.instance.setReferenceInlineProvider(referenceProvider)
            await InlineCompletionService.instance.onCursorChange({
                textEditor: vscode.window.activeTextEditor!,
                selections: [],
                kind: vscode.TextEditorSelectionChangeKind.Mouse,
            })
            assert.strictEqual(referenceProvider.refs.length, 0)
        })
    })
})
