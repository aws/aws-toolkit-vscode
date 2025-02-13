/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as path from 'path'
import { setValidConnection, skipTestIfNoValidConn } from '../util/connection'
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
import { getTestWorkspaceFolder } from '../../testInteg/integrationTestsUtilities'
import { session } from '../../codewhisperer/util/codeWhispererSession'

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
        validConnection = await setValidConnection()
    })

    beforeEach(function () {
        void resetCodeWhispererGlobalVariables()
        RecommendationHandler.instance.clearRecommendations()
        // valid connection required to run tests
        skipTestIfNoValidConn(validConnection, this)
    })

    it('manual trigger returns valid recommendation response', async function () {
        // check that handler is empty before invocation
        const requestIdBefore = RecommendationHandler.instance.requestId
        const sessionIdBefore = session.sessionId
        const validRecsBefore = RecommendationHandler.instance.isValidResponse()

        assert.ok(requestIdBefore.length === 0)
        assert.ok(sessionIdBefore.length === 0)
        assert.ok(!validRecsBefore)

        const mockEditor = createMockTextEditor()
        await invokeRecommendation(mockEditor, client, config)

        const requestId = RecommendationHandler.instance.requestId
        const sessionId = session.sessionId
        const validRecs = RecommendationHandler.instance.isValidResponse()

        assert.ok(requestId.length > 0)
        assert.ok(sessionId.length > 0)
        assert.ok(validRecs)
    })

    it('auto trigger returns valid recommendation response', async function () {
        // check that handler is empty before invocation
        const requestIdBefore = RecommendationHandler.instance.requestId
        const sessionIdBefore = session.sessionId
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

        await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, client, config)
        // wait for 5 seconds to allow time for response to be generated
        await sleep(5000)

        const requestId = RecommendationHandler.instance.requestId
        const sessionId = session.sessionId
        const validRecs = RecommendationHandler.instance.isValidResponse()

        assert.ok(requestId.length > 0)
        assert.ok(sessionId.length > 0)
        assert.ok(validRecs)
    })

    it('invocation in unsupported language does not generate a request', async function () {
        const workspaceFolder = getTestWorkspaceFolder()
        const appRoot = path.join(workspaceFolder, 'go1-plain-sam-app')
        const appCodePath = path.join(appRoot, 'hello-world', 'main.go')

        // check that handler is empty before invocation
        const requestIdBefore = RecommendationHandler.instance.requestId
        const sessionIdBefore = session.sessionId
        const validRecsBefore = RecommendationHandler.instance.isValidResponse()

        assert.ok(requestIdBefore.length === 0)
        assert.ok(sessionIdBefore.length === 0)
        assert.ok(!validRecsBefore)

        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(appCodePath))
        const editor = await vscode.window.showTextDocument(doc)
        await invokeRecommendation(editor, client, config)

        const requestId = RecommendationHandler.instance.requestId
        const sessionId = session.sessionId
        const validRecs = RecommendationHandler.instance.isValidResponse()

        assert.ok(requestId.length === 0)
        assert.ok(sessionId.length === 0)
        assert.ok(!validRecs)
    })
})
