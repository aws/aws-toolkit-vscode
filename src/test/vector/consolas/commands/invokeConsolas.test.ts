/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as consolasSDkClient from '../../../../vector/consolas/client/consolas'
import { resetConsolasGlobalVariables, createMockTextEditor } from '../testUtil'
import { ConfigurationEntry } from '../../../../vector/consolas/models/model'
import * as messages from '../../../../shared/utilities/messages'
import { invokeConsolas } from '../../../../vector/consolas/commands/invokeConsolas'
import { InlineCompletion } from '../../../../vector/consolas/service/inlineCompletion'
import { KeyStrokeHandler } from '../../../../vector/consolas/service/keyStrokeHandler'

describe('invokeConsolas', function () {
    describe('invokeConsolas', function () {
        let promptMessageSpy: sinon.SinonSpy
        let getRecommendationStub: sinon.SinonStub
        let mockClient: consolasSDkClient.DefaultConsolasClient

        beforeEach(function () {
            resetConsolasGlobalVariables()
            promptMessageSpy = sinon.spy(messages, 'showTimedMessage')
            getRecommendationStub = sinon.stub(InlineCompletion.instance, 'getPaginatedRecommendation')
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

        it("Should skip if there's IN-PROGRESS invocation, should not call getRecommendations", async function () {
            const config: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: true,
                isIncludeSuggestionsWithCodeReferencesEnabled: true,
            }
            const mockEditor = createMockTextEditor()
            InlineCompletion.instance.setConsolasStatusBarLoading()
            await invokeConsolas(mockEditor, mockClient, config)
            assert.ok(!getRecommendationStub.called)
            InlineCompletion.instance.setConsolasStatusBarOk()
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

        it('When called, keyStrokeCount should be set to 0', async function () {
            const mockEditor = createMockTextEditor()
            KeyStrokeHandler.instance.keyStrokeCount = 10
            const config: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: true,
                isIncludeSuggestionsWithCodeReferencesEnabled: true,
            }
            await invokeConsolas(mockEditor, mockClient, config)
            assert.strictEqual(KeyStrokeHandler.instance.keyStrokeCount, 0)
        })
    })
})
