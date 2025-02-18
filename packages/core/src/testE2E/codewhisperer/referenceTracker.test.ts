/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as codewhispererClient from '../../codewhisperer/client/codewhisperer'
import { ConfigurationEntry } from '../../codewhisperer/models/model'
import { setValidConnection, skipTestIfNoValidConn } from '../util/connection'
import { RecommendationHandler } from '../../codewhisperer/service/recommendationHandler'
import { createMockTextEditor, resetCodeWhispererGlobalVariables } from '../../test/codewhisperer/testUtil'
import { invokeRecommendation } from '../../codewhisperer/commands/invokeRecommendation'
import { session } from '../../codewhisperer/util/codeWhispererSession'

/*
New model deployment may impact references returned. 

These tests:
    1) are not required for github approval flow 
    2) will be auto-skipped until fix for manual runs is posted.
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
        validConnection = await setValidConnection()
    })

    beforeEach(function () {
        void resetCodeWhispererGlobalVariables()
        RecommendationHandler.instance.clearRecommendations()
        // TODO: remove this line (this.skip()) when these tests no longer auto-skipped
        this.skip()
        // valid connection required to run tests
        skipTestIfNoValidConn(validConnection, this)
    })

    it('trigger known to return recs with references returns rec with reference', async function () {
        // check that handler is empty before invocation
        const requestIdBefore = RecommendationHandler.instance.requestId
        const sessionIdBefore = session.sessionId
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

        const requestId = RecommendationHandler.instance.requestId
        const sessionId = session.sessionId
        const validRecs = RecommendationHandler.instance.isValidResponse()
        const references = session.recommendations[0].references

        assert.ok(requestId.length > 0)
        assert.ok(sessionId.length > 0)
        assert.ok(validRecs)
        assert.ok(references !== undefined)
        // TODO: uncomment this assert when this test is no longer auto-skipped
        // assert.ok(references.length > 0)
    })

    // This test will fail if user is logged in with IAM identity center
    it('trigger known to return rec with references does not return rec with references when reference tracker setting is off', async function () {
        // check that handler is empty before invocation
        const requestIdBefore = RecommendationHandler.instance.requestId
        const sessionIdBefore = session.sessionId
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

        const requestId = RecommendationHandler.instance.requestId
        const sessionId = session.sessionId
        const validRecs = RecommendationHandler.instance.isValidResponse()

        assert.ok(requestId.length > 0)
        assert.ok(sessionId.length > 0)
        // no recs returned because example request returns 1 rec with reference, so no recs returned when references off
        assert.ok(!validRecs)
    })
})
