/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { setValidConnection } from './util'
import { ConfigurationEntry } from '../../codewhisperer/models/model'
import * as codewhispererClient from '../../codewhisperer/client/codewhisperer'
import { RecommendationHandler } from '../../codewhisperer/service/recommendationHandler'
import {
    createMockTextEditor,
    createTextDocumentChangeEvent,
    resetCodeWhispererGlobalVariables,
} from '../../test/codewhisperer/testUtil'
import { KeyStrokeHandler } from '../../codewhisperer/service/keyStrokeHandler'
import { sleep } from '../../shared/utilities/timeoutUtils'
import { invokeRecommendation } from '../../codewhisperer/commands/invokeRecommendation'

describe('CodeWhisperer service invocation', async function () {
    let validConnection: boolean
    const client = new codewhispererClient.DefaultCodeWhispererClient()
    const config: ConfigurationEntry = {
        isShowMethodsEnabled: true,
        isManualTriggerEnabled: true,
        isAutomatedTriggerEnabled: true,
        isSuggestionsWithCodeReferencesEnabled: true,
    }

    before(async function () {
        //valid connection required to run tests
        validConnection = await setValidConnection()
    })

    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
        RecommendationHandler.instance.clearRecommendations()
    })

    it('manual trigger returns valid recommendation response', async function () {
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

        const mockEditor = createMockTextEditor()
        await invokeRecommendation(mockEditor, client, config)

        //verify valid requestId, sessionId, and recommendations after invokeRecommendation call
        const requestId = RecommendationHandler.instance.requestId
        const sessionId = RecommendationHandler.instance.sessionId
        const validRecs = RecommendationHandler.instance.isValidResponse()
        assert.ok(requestId.length > 0)
        assert.ok(sessionId.length > 0)
        assert.ok(validRecs)
    })

    it('auto trigger returns valid recommendation response', async function () {
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

        const mockEditor = createMockTextEditor()

        const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
            mockEditor.document,
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
            '\n'
        )

        //call keystroke handler with mock editor, mock event, and real client
        await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, client, config)

        //wait for 5 seconds to allow time for response to be generated
        await sleep(5000)

        //verify valid requestId, sessionId, and recommendations after processKeyStroke call
        const requestId = RecommendationHandler.instance.requestId
        const sessionId = RecommendationHandler.instance.sessionId
        const validRecs = RecommendationHandler.instance.isValidResponse()
        assert.ok(requestId.length > 0)
        assert.ok(sessionId.length > 0)
        assert.ok(validRecs)
    })

    it('invocation in unsupported language does not generate a request', async function () {
        if (!validConnection) {
            this.skip()
        }

        const doc = ''
        const filename = 'test.rb'
        const language = 'ruby'
        const line = 0
        const char = 0

        //check that handler is empty before invocation
        const requestIdBefore = RecommendationHandler.instance.requestId
        const sessionIdBefore = RecommendationHandler.instance.sessionId
        const validRecsBefore = RecommendationHandler.instance.isValidResponse()
        assert.ok(requestIdBefore.length === 0)
        assert.ok(sessionIdBefore.length === 0)
        assert.ok(!validRecsBefore)

        const mockEditor = createMockTextEditor(doc, filename, language, line, char)
        await invokeRecommendation(mockEditor, client, config)

        //verify no recommendation generated after invokeRecommendation call
        const requestId = RecommendationHandler.instance.requestId
        const sessionId = RecommendationHandler.instance.sessionId
        const validRecs = RecommendationHandler.instance.isValidResponse()
        assert.ok(requestId.length === 0)
        assert.ok(sessionId.length === 0)
        assert.ok(!validRecs)
    })
})
