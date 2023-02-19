/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as codewhispererClient from '../../codewhisperer/client/codewhisperer'
import { ConfigurationEntry } from '../../codewhisperer/models/model'
import { setValidConnection } from './util'
import { RecommendationHandler } from '../../codewhisperer/service/recommendationHandler'
import { createMockTextEditor, resetCodeWhispererGlobalVariables } from '../../test/codewhisperer/testUtil'
import { invokeRecommendation } from '../../codewhisperer/commands/invokeRecommendation'

/*
   In order to run codewhisperer integration tests user must:
   
    1) run using VSC launch config.
    2) have a valid codewhisperer connection.

   Test cases will skip if the above criteria are not met.
   If user has an expired connection they must reauthenticate prior to running tests.
*/

const leftContext = `InAuto.GetContent(
    InAuto.servers.auto, "vendors.json",
    function (data) {
        let block = '';
        for(let i = 0; i < data.length; i++) {
            block += '<a href="' + data`

const rightContext = `[i].title + '">' + cars[i].title + '</a>';
        }
        $('#cars').html(block);
    });`

describe('CodeWhisperer service invocation', async function () {
    let validConnection: boolean
    const client = new codewhispererClient.DefaultCodeWhispererClient()
    const configWithRefs: ConfigurationEntry = {
        isShowMethodsEnabled: true,
        isManualTriggerEnabled: true,
        isAutomatedTriggerEnabled: true,
        isSuggestionsWithCodeReferencesEnabled: true,
    }
    const configWithNoRefs: ConfigurationEntry = {
        isShowMethodsEnabled: true,
        isManualTriggerEnabled: true,
        isAutomatedTriggerEnabled: true,
        isSuggestionsWithCodeReferencesEnabled: false,
    }

    before(async function () {
        //valid connection required to run tests
        validConnection = await setValidConnection()
    })

    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
        RecommendationHandler.instance.clearRecommendations()
    })

    it('trigger known to return recs with references returns rec with reference', async function () {
        if (!validConnection) {
            this.skip()
        }

        //check that handler is empty before invocation
        const requestIdBefore = RecommendationHandler.instance.requestId
        const sessionIdBefore = RecommendationHandler.instance.sessionId
        const validRecsBefore = RecommendationHandler.instance.isValidResponse()
        assert.ok(requestIdBefore.length === 0)
        assert.ok(sessionIdBefore.length === 0)
        assert.ok(!validRecsBefore)

        const doc = leftContext + rightContext
        const filename = 'test.js'
        const language = 'javascript'
        const line = 5
        const character = 39
        const mockEditor = createMockTextEditor(doc, filename, language, line, character)

        await invokeRecommendation(mockEditor, client, configWithRefs)

        console.log('recs', RecommendationHandler.instance.recommendations[0])
        const requestId = RecommendationHandler.instance.requestId
        const sessionId = RecommendationHandler.instance.sessionId
        const validRecs = RecommendationHandler.instance.isValidResponse()
        const references = RecommendationHandler.instance.recommendations[0].references
        console.log('references', references)

        assert.ok(requestId.length > 0)
        assert.ok(sessionId.length > 0)
        assert.ok(validRecs)
        assert.ok(references !== undefined)
        assert.ok(references.length > 0)
    })

    //This test will fail if user is logged in with IAM identity center
    it('trigger known to return rec with references does not return rec with references when reference tracker setting is off', async function () {
        if (!validConnection) {
            this.skip()
        }

        //check that handler is empty before invocation
        const requestIdBefore = RecommendationHandler.instance.requestId
        const sessionIdBefore = RecommendationHandler.instance.sessionId
        const validRecsBefore = RecommendationHandler.instance.isValidResponse()
        assert.ok(requestIdBefore.length === 0)
        assert.ok(sessionIdBefore.length === 0)
        assert.ok(!validRecsBefore)

        const doc = leftContext + rightContext
        const filename = 'test.js'
        const language = 'javascript'
        const line = 5
        const character = 39
        const mockEditor = createMockTextEditor(doc, filename, language, line, character)

        await invokeRecommendation(mockEditor, client, configWithNoRefs)

        //verify valid requestId, sessionId, and recommendations after invokeRecommendation call
        console.log('recs', RecommendationHandler.instance.recommendations)
        const requestId = RecommendationHandler.instance.requestId
        const sessionId = RecommendationHandler.instance.sessionId
        const validRecs = RecommendationHandler.instance.isValidResponse()

        /*
        verify valid requestId and sessionId and no recs.
        No recs returned because example request returns 1 rec with recommendation, so no recs returned when references off
        */
        assert.ok(requestId.length > 0)
        assert.ok(sessionId.length > 0)
        assert.ok(!validRecs)
    })
})
