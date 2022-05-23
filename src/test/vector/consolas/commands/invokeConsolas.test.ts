/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as consolasSDkClient from '../../../../vector/consolas/client/consolas'
import { resetConsolasGlobalVariables, createMockTextEditor } from '../testUtil'
import {
    invocationContext,
    automatedTriggerContext,
    ConfigurationEntry,
} from '../../../../vector/consolas/models/model'
import * as messages from '../../../../shared/utilities/messages'
import { invokeConsolas } from '../../../../vector/consolas/commands/invokeConsolas'
import * as KeyStrokeHandler from '../../../../vector/consolas/service/keyStrokeHandler'
import * as inlineCompletions from '../../../../vector/consolas/service/inlineCompletion'

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
            const config: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: false,
                isAutomatedTriggerEnabled: true,
                isIncludeSuggestionsWithCodeReferencesEnabled: true,
            }
            const mockEditor = createMockTextEditor()
            await invokeConsolas(mockEditor, mockClient, config)
            assert.ok(promptMessageSpy.calledOnce)
            assert.ok(!getRecommendationStub.called)
        })

        it("Should skip if there's IN-PROGRESS invocation, should not prompt message, should not call getRecommendations", async function () {
            const config: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: true,
                isIncludeSuggestionsWithCodeReferencesEnabled: true,
            }
            invocationContext.isPendingResponse = true
            const mockEditor = createMockTextEditor()
            await invokeConsolas(mockEditor, mockClient, config)
            assert.ok(!promptMessageSpy.called)
            assert.ok(!getRecommendationStub.called)
        })

        it('Should call showWarningMessage if editor.suggest.showMethods(isShowMethods) is false, should not call getRecommendations', async function () {
            const spy = sinon.spy(vscode.window, 'showWarningMessage')
            const mockEditor = createMockTextEditor()
            const config: ConfigurationEntry = {
                isShowMethodsEnabled: false,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: true,
                isIncludeSuggestionsWithCodeReferencesEnabled: true,
            }
            await invokeConsolas(mockEditor, mockClient, config)
            assert.ok(spy.calledOnce)
            assert.ok(!getRecommendationStub.called)
        })

        it('Should call getRecommendation with OnDemand as trigger type', async function () {
            const mockEditor = createMockTextEditor()
            const config: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: true,
                isIncludeSuggestionsWithCodeReferencesEnabled: true,
            }
            await invokeConsolas(mockEditor, mockClient, config)
            assert.ok(getRecommendationStub.called)
        })

        it('Should call showFirstRecommendationStub when at least one response is valid, keyStrokeCount should be set to 0', async function () {
            const mockEditor = createMockTextEditor()
            const showFirstRecommendationStub = sinon.spy(inlineCompletions, 'showFirstRecommendation')
            automatedTriggerContext.keyStrokeCount = 10
            const config: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: true,
                isIncludeSuggestionsWithCodeReferencesEnabled: true,
            }
            await invokeConsolas(mockEditor, mockClient, config)
            assert.strictEqual(automatedTriggerContext.keyStrokeCount, 0)
            sinon.assert.calledWith(showFirstRecommendationStub, mockEditor)
        })

        it('Should call prompt message with no suggestions when responses are all invalid', async function () {
            const mockEditor = createMockTextEditor()
            getRecommendationStub.restore()
            getRecommendationStub = sinon
                .stub(KeyStrokeHandler, 'getRecommendations')
                .resolves([{ content: '' }, { content: '' }])
            const config: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: true,
                isIncludeSuggestionsWithCodeReferencesEnabled: true,
            }
            await invokeConsolas(mockEditor, mockClient, config)
            assert.ok(promptMessageSpy.calledWith('No suggestions from Consolas', 2000))
        })
    })
})
