/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { assertTelemetryCurried, createTestWorkspaceFolder, openATextEditorWithText } from '../../testUtil'
import {
    DefaultCodeWhispererClient,
    ListRecommendationsRequest,
    ListRecommendationsResponse,
} from '../../../codewhisperer/client/codewhisperer'
import { invokeRecommendation } from '../../../codewhisperer/commands/invokeRecommendation'
import { ConfigurationEntry } from '../../../codewhisperer/models/model'
import { waitUntil } from '../../../shared/utilities/timeoutUtils'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'
import { resetCodeWhispererGlobalVariables } from '../testUtil'
import { session } from '../../../codewhisperer/util/codeWhispererSession'

type CodeWhispererResponse = ListRecommendationsResponse & {
    $response: { requestId: string; httpResponse: { headers: { [key: string]: string } } }
}

let tempFolder: string

describe('', async function () {
    let sandbox: sinon.SinonSandbox
    let client: DefaultCodeWhispererClient

    let config: ConfigurationEntry = {
        isShowMethodsEnabled: true,
        isManualTriggerEnabled: true,
        isAutomatedTriggerEnabled: true,
        isSuggestionsWithCodeReferencesEnabled: true,
    }

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        client = mockClient(aResponse())
        await resetStates()
    })

    afterEach(function () {
        sandbox.restore()
    })

    async function resetStates() {
        await RecommendationHandler.instance.clearInlineCompletionStates()
        resetCodeWhispererGlobalVariables()
    }

    function mockClient(response: CodeWhispererResponse): DefaultCodeWhispererClient {
        const cwClient = new DefaultCodeWhispererClient()
        sandbox.stub(cwClient, 'listRecommendations').resolves(response)
        sandbox.stub(cwClient, 'generateRecommendations').resolves(response)

        return cwClient
    }

    function assertCleanStates() {
        assert.strictEqual(session.requestIdList.length, 0)
        assert.strictEqual(session.recommendations.length, 0)
        assert.strictEqual(session.completionTypes.size, 0)
        assert.strictEqual(session.completionTypes.size, 0)
    }

    async function manualTrigger(
        editor: vscode.TextEditor,
        client: DefaultCodeWhispererClient,
        config: ConfigurationEntry
    ) {
        await invokeRecommendation(editor, client, config)
        // await sleep(1000) // no programmatically way to wait until the inline suggestion UI is shown
    }

    async function waitUntilSuggestionSeen(index: number) {
        const state = await waitUntil(
            async () => {
                const r = session.getSuggestionState(index)
                if (r) {
                    return r
                }
            },
            {
                interval: 50,
            }
        )

        assert.ok(state === 'Showed')
    }

    function acceptByTab() {
        return vscode.commands.executeCommand('editor.action.inlineSuggest.commit')
    }

    async function rejectByEsc() {
        return vscode.commands.executeCommand('editor.action.inlineSuggest.hide')
    }

    it('simple accept - tab', async function () {
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py')

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen(0)
        acceptByTab().then(() => {
            const assertUserTriggerDecision = assertTelemetryCurried('codewhisperer_userTriggerDecision')
            assertUserTriggerDecision({
                codewhispererSessionId: 'sessionId',
                codewhispererFirstRequestId: 'requestId',
                codewhispererLanguage: 'python',
                codewhispererTriggerType: 'OnDemand',
                codewhispererLineNumber: 0,
                codewhispererCursorOffset: 0,
                codewhispererSuggestionCount: 1,
                codewhispererCompletionType: 'Line',
                codewhispererSuggestionState: 'Accept',
                codewhispererSuggestionImportCount: 0,
                codewhispererTypeaheadLength: 0,
                codewhispererUserGroup: 'Control',
            })
        })
    })

    it('simple reject - esc key', async function () {
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py')

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen(0)
        await rejectByEsc().then(() => {
            const s = session
            console.log()
            // force codewhisperer to flush telemetry
            RecommendationHandler.instance.onEditorChange()

            const assertUserTriggerDecision = assertTelemetryCurried('codewhisperer_userTriggerDecision')
            assertUserTriggerDecision({
                codewhispererSessionId: 'sessionId',
                codewhispererFirstRequestId: 'requestId',
                codewhispererLanguage: 'python',
                codewhispererTriggerType: 'OnDemand',
                codewhispererLineNumber: 0,
                codewhispererCursorOffset: 0,
                codewhispererSuggestionCount: 1,
                codewhispererCompletionType: 'Line',
                codewhispererSuggestionState: 'Reject',
                codewhispererSuggestionImportCount: 0,
                codewhispererTypeaheadLength: 0,
                codewhispererUserGroup: 'Control',
            })
        })
    })
})

function aRequest(): ListRecommendationsRequest {
    return {
        fileContext: {
            filename: '',
            leftFileContent: '',
            rightFileContent: '',
            programmingLanguage: { languageName: '' },
        },
    }
}

function aResponse(): CodeWhispererResponse {
    return {
        recommendations: [
            {
                content: '"Hello world"',
            },
        ],
        $response: {
            requestId: 'requestId',
            httpResponse: {
                headers: {
                    'x-amzn-sessionid': 'sessionId',
                },
            },
        },
    }
}
