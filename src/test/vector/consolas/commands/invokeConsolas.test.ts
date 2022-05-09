/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as consolasSDkClient from '../../../../vector/consolas/client/consolas'
import { resetConsolasGlobalVariables, createMockTextEditor } from '../testUtil'
import { invocationContext, automatedTriggerContext } from '../../../../vector/consolas/models/model'
import * as messages from '../../../../shared/utilities/messages'
import { invokeConsolas } from '../../../../vector/consolas/commands/invokeConsolas'
import * as KeyStrokeHandler from '../../../../vector/consolas/service/keyStrokeHandler'
import * as inlineCompletions from '../../../../vector/consolas/views/recommendationSelectionProvider'

describe('invokeConsolas', function () {
    describe('invokeConsolas', function () {
        let promptMessageSpy: sinon.SinonSpy
        let getRecommendationStub: sinon.SinonStub
        let mockClient: consolasSDkClient.DefaultConsolasClient

        beforeEach(function () {
            resetConsolasGlobalVariables()
            promptMessageSpy = sinon.spy(messages, 'showTimedMessage')
            getRecommendationStub = sinon
                .stub(KeyStrokeHandler, 'getRecommendations')
                .resolves([{ content: "print('Hello World!')" }, { content: "print('Hello!')" }])
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should call showTimedMessage if Consolas (Manual Trigger) turned off, should not call getRecommendations', async function () {
            const isManualTriggerEnabled = false
            const isAutoTriggerEnabled = false
            const mockEditor = createMockTextEditor()
            await invokeConsolas(mockEditor, mockClient, true, isManualTriggerEnabled, isAutoTriggerEnabled)
            assert.ok(promptMessageSpy.calledOnce)
            assert.ok(!getRecommendationStub.called)
        })

        it("Should skip if there's IN-PROGRESS invocation, should not prompt message, should not call getRecommendations", async function () {
            const isManualTriggerEnabled = true
            invocationContext.isPendingResponse = true
            const mockEditor = createMockTextEditor()
            await invokeConsolas(mockEditor, mockClient, true, isManualTriggerEnabled, true)
            assert.ok(!promptMessageSpy.called)
            assert.ok(!getRecommendationStub.called)
        })

        it('Should call showWarningMessage if editor.suggest.showMethods(isShowMethods) is false, should not call getRecommendations', async function () {
            const spy = sinon.spy(vscode.window, 'showWarningMessage')
            const mockEditor = createMockTextEditor()
            vscode.workspace
                .getConfiguration('editor')
                .update('suggest.showMethods', false, vscode.ConfigurationTarget.Global)
            await invokeConsolas(mockEditor, mockClient, false, true, true)
            assert.ok(spy.calledOnce)
            assert.ok(!getRecommendationStub.called)
        })

        it('Should call getRecommendation with OnDemand as trigger type', async function () {
            const mockEditor = createMockTextEditor()
            await invokeConsolas(mockEditor, mockClient, true, true, true)
            assert.ok(getRecommendationStub.called)
        })

        it('Should call showFirstRecommendationStub when at least one response is valid, keyStrokeCount should be set to 0', async function () {
            const mockEditor = createMockTextEditor()
            const showFirstRecommendationStub = sinon.spy(inlineCompletions, 'showFirstRecommendation')
            automatedTriggerContext.keyStrokeCount = 10
            await invokeConsolas(mockEditor, mockClient, true, true, true)
            assert.strictEqual(automatedTriggerContext.keyStrokeCount, 0)
            sinon.assert.calledWith(showFirstRecommendationStub, mockEditor)
        })

        it('Should call prompt message with no suggestions when responses are all invalid', async function () {
            const mockEditor = createMockTextEditor()
            getRecommendationStub.restore()
            getRecommendationStub = sinon
                .stub(KeyStrokeHandler, 'getRecommendations')
                .resolves([{ content: '' }, { content: '' }])
            await invokeConsolas(mockEditor, mockClient, true, true, true)
            assert.ok(promptMessageSpy.calledWith('No suggestions from Consolas', 2000))
        })
    })
})
