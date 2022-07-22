/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as codewhispererSdkClient from '../../../codewhisperer/client/codewhisperer'
import { resetCodeWhispererGlobalVariables, createMockTextEditor } from '../testUtil'
import { ConfigurationEntry } from '../../../codewhisperer/models/model'
import { invokeRecommendation } from '../../../codewhisperer/commands/invokeRecommendation'
import { InlineCompletion } from '../../../codewhisperer/service/inlineCompletion'
import { KeyStrokeHandler } from '../../../codewhisperer/service/keyStrokeHandler'

describe('invokeRecommendation', function () {
    describe('invokeRecommendation', function () {
        let getRecommendationStub: sinon.SinonStub
        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            getRecommendationStub = sinon.stub(InlineCompletion.instance, 'getPaginatedRecommendation')
        })

        afterEach(function () {
            sinon.restore()
        })

        it("Should skip if there's IN-PROGRESS invocation, should not call getRecommendations", async function () {
            const config: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: true,
                isIncludeSuggestionsWithCodeReferencesEnabled: true,
            }
            const mockEditor = createMockTextEditor()
            InlineCompletion.instance.setCodeWhispererStatusBarLoading()
            await invokeRecommendation(mockEditor, mockClient, config)
            assert.ok(!getRecommendationStub.called)
            InlineCompletion.instance.setCodeWhispererStatusBarOk()
        })

        it('Should call getRecommendation with OnDemand as trigger type', async function () {
            const mockEditor = createMockTextEditor()
            const config: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: true,
                isIncludeSuggestionsWithCodeReferencesEnabled: true,
            }
            await invokeRecommendation(mockEditor, mockClient, config)
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
            await invokeRecommendation(mockEditor, mockClient, config)
            assert.strictEqual(KeyStrokeHandler.instance.keyStrokeCount, 0)
        })
    })
})
