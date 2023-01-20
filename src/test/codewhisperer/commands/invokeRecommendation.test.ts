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
import { InlineCompletionService } from '../../../codewhisperer/service/inlineCompletionService'

describe('invokeRecommendation', function () {
    describe('invokeRecommendation', function () {
        let getRecommendationStub: sinon.SinonStub
        let oldGetRecommendationStub: sinon.SinonStub
        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
            getRecommendationStub = sinon.stub(InlineCompletion.instance, 'getPaginatedRecommendation')
            oldGetRecommendationStub = sinon.stub(InlineCompletionService.instance, 'getPaginatedRecommendation')
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should call getPaginatedRecommendation with OnDemand as trigger type', async function () {
            const mockEditor = createMockTextEditor()
            const config: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: true,
                isSuggestionsWithCodeReferencesEnabled: true,
            }
            await invokeRecommendation(mockEditor, mockClient, config)
            assert.ok(getRecommendationStub.called || oldGetRecommendationStub.called)
        })
    })
})
