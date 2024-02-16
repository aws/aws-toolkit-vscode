/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as codewhispererSdkClient from '../../../codewhisperer/client/codewhisperer'
import { resetCodeWhispererGlobalVariables, createMockTextEditor } from '../testUtil'
import { ConfigurationEntry } from '../../../codewhisperer/models/model'
import { invokeRecommendation } from '../../../codewhisperer/commands/invokeRecommendation'
import { InlineCompletionService } from '../../../codewhisperer/service/inlineCompletionService'
import { isInlineCompletionEnabled } from '../../../codewhisperer/util/commonUtil'

describe('invokeRecommendation', function () {
    describe('invokeRecommendation', function () {
        let getRecommendationStub: sinon.SinonStub
        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient

        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
            getRecommendationStub = sinon.stub(InlineCompletionService.instance, 'getPaginatedRecommendation')
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should call getPaginatedRecommendation with OnDemand as trigger type when inline completion is enabled', async function () {
            const mockEditor = createMockTextEditor()
            const config: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: true,
                isSuggestionsWithCodeReferencesEnabled: true,
            }
            await invokeRecommendation(mockEditor, mockClient, config)
            assert.strictEqual(getRecommendationStub.called, isInlineCompletionEnabled())
        })
    })
})
