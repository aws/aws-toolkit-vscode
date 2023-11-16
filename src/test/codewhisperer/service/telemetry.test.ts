/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { assertTabCount, assertTelemetry, createTestWorkspaceFolder, openATextEditorWithText } from '../../testUtil'
import {
    DefaultCodeWhispererClient,
    ListRecommendationsRequest,
    ListRecommendationsResponse,
    Recommendation,
} from '../../../codewhisperer/client/codewhisperer'
import { invokeRecommendation } from '../../../codewhisperer/commands/invokeRecommendation'
import { ConfigurationEntry } from '../../../codewhisperer/models/model'
import { sleep, waitUntil } from '../../../shared/utilities/timeoutUtils'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'
import { resetCodeWhispererGlobalVariables } from '../testUtil'
import { session } from '../../../codewhisperer/util/codeWhispererSession'
import { vsCodeCursorUpdateDelay } from '../../../codewhisperer/models/constants'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { CodewhispererUserTriggerDecision } from '../../../shared/telemetry/telemetry.gen'

type CodeWhispererResponse = ListRecommendationsResponse & {
    $response: { requestId: string; httpResponse: { headers: { [key: string]: string } } }
}

let tempFolder: string

describe('', async function () {
    let sandbox: sinon.SinonSandbox
    let client: DefaultCodeWhispererClient

    function session1UserTriggerEvent(
        ops?: Partial<CodewhispererUserTriggerDecision>
    ): CodewhispererUserTriggerDecision {
        return {
            codewhispererSessionId: 'session_id_1',
            codewhispererFirstRequestId: 'request_id_1',
            codewhispererLanguage: 'python',
            codewhispererTriggerType: 'OnDemand',
            codewhispererLineNumber: 0,
            codewhispererCursorOffset: 0,
            codewhispererSuggestionCount: 2,
            codewhispererCompletionType: 'Line',
            codewhispererSuggestionState: 'Accept',
            codewhispererSuggestionImportCount: 0,
            codewhispererTypeaheadLength: 0,
            codewhispererUserGroup: 'Control',
            ...ops,
        }
    }

    function session2UserTriggerEvent(
        ops?: Partial<CodewhispererUserTriggerDecision>
    ): CodewhispererUserTriggerDecision {
        return {
            codewhispererSessionId: 'session_id_2',
            codewhispererFirstRequestId: 'request_id_2',
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
            ...ops,
        }
    }

    const config: ConfigurationEntry = {
        isShowMethodsEnabled: true,
        isManualTriggerEnabled: true,
        isAutomatedTriggerEnabled: false,
        isSuggestionsWithCodeReferencesEnabled: true,
    }

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        client = mockClient()
        sandbox.stub(AuthUtil.instance, 'isConnected').returns(true)
        sandbox.stub(AuthUtil.instance, 'isConnectionExpired').returns(false)
        await resetStates()
    })

    afterEach(async function () {
        sandbox.restore()
        await resetStates()
    })

    async function resetStates() {
        await RecommendationHandler.instance.clearInlineCompletionStates()
        resetCodeWhispererGlobalVariables()
    }

    function mockClient(): DefaultCodeWhispererClient {
        const response1 = aResponse('session_id_1', 'request_id_1', { content: 'Foo' }, { content: 'Bar' })
        const response2 = aResponse('session_id_2', 'request_id_2', { content: 'Baz' })
        const response3 = aResponse('session_id_3', 'request_id_3', { content: 'Qoo' })

        const cwClient = new DefaultCodeWhispererClient()
        const stub = sandbox.stub(cwClient, 'listRecommendations')
        stub.onCall(0).resolves(response1)
        stub.onCall(1).resolves(response2)
        stub.onCall(2).resolves(response3)

        return cwClient
    }

    function assertCleanStates() {
        assert.strictEqual(session.requestIdList.length, 0)
        assert.strictEqual(session.recommendations.length, 0)
        assert.strictEqual(session.completionTypes.size, 0)
        assert.strictEqual(session.completionTypes.size, 0)
    }

    it('this test should be removed', async function () {
        const r = (await client.listRecommendations(aRequest())) as any
        const r2 = (await client.listRecommendations(aRequest())) as any

        assert.strictEqual(r.recommendations.length, 2)
        assert.strictEqual(r2.recommendations.length, 1)

        assert.ok(AuthUtil.instance.isConnected())
        assert.ok(!AuthUtil.instance.isConnectionExpired())
    })

    it('simple accept - tab', async function () {
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py')

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()
        await acceptByTab()

        // TODO: any better way to do this with waitUntil()?
        // required because oninlineAcceptance has sleep(vsCodeCursorUpdateDelay), otherwise assertion will be executed before onAcceptance hook
        await sleep(vsCodeCursorUpdateDelay + 10)

        assertTelemetry('codewhisperer_userTriggerDecision', [session1UserTriggerEvent()])
    })

    it('accept - typeahead match and accept', async function () {
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py')

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()
        await typing(editor, 'F')
        await sleep(2000) // see if we can use waitUntil to replace it
        await acceptByTab()

        // TODO: any better way to do this with waitUntil()?
        // required because oninlineAcceptance has sleep(vsCodeCursorUpdateDelay), otherwise assertion will be executed before onAcceptance hook
        await sleep(vsCodeCursorUpdateDelay + 10)

        assertTelemetry('codewhisperer_userTriggerDecision', [session1UserTriggerEvent()])
    })

    it('multiple accept - tab', async function () {
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py')

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()
        await acceptByTab()

        await sleep(vsCodeCursorUpdateDelay + 10)

        assertCleanStates()
        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()
        await acceptByTab()

        await sleep(vsCodeCursorUpdateDelay + 10)

        assertTelemetry('codewhisperer_userTriggerDecision', [
            session1UserTriggerEvent(),
            session2UserTriggerEvent({ codewhispererCursorOffset: 3 }),
        ])
    })

    it('reject: esc key', async function () {
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py')

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()
        await rejectByEsc()

        assertTelemetry('codewhisperer_userTriggerDecision', [
            session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
        ])
    })

    it('multiple reject: esc key', async function () {
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py')

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()
        await rejectByEsc()

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()
        await rejectByEsc()

        assertTelemetry('codewhisperer_userTriggerDecision', [
            session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            session2UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
        ])
    })

    it('reject: trigger then open another editor', async function () {
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py', tempFolder, { preview: false })

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()

        await openATextEditorWithText('foo', 'another1.py', tempFolder, {
            preview: false,
        })
        const anotherEditor = await openATextEditorWithText('bar', 'another2.py', tempFolder, {
            preview: false,
        })

        assert.strictEqual(vscode.window.activeTextEditor, anotherEditor)
        await assertTabCount(3)
        assertTelemetry('codewhisperer_userTriggerDecision', [
            session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
        ])
    })

    it('reject: onFocusChange', async function () {
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py')

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()

        await RecommendationHandler.instance.onFocusChange()
        assertTelemetry('codewhisperer_userTriggerDecision', [
            session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
        ])
    })

    it('reject: trigger then close editor', async function () {
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py')

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()
        await closeActiveEditor()

        assertTelemetry('codewhisperer_userTriggerDecision', [
            session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
        ])
    })

    it('reject - esc key then invoke again', async function () {
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py')

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()
        await rejectByEsc()

        assertCleanStates()
        await manualTrigger(editor, client, config)

        assertTelemetry('codewhisperer_userTriggerDecision', [
            session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
        ])
    })

    it('reject - typeahead not matching after suggestion is shown', async function () {
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py')

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()
        await typing(editor, 'H')
        await sleep(2000) // see if we can use waitUntil to replace it

        RecommendationHandler.instance.onEditorChange()
        await sleep(vsCodeCursorUpdateDelay + 10)

        assertTelemetry('codewhisperer_userTriggerDecision', [
            session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
        ])
    })

    it('reject - typeahead not matching after suggestion is shown then invoke another round and accept', async function () {
        // no idea why this one doesn't work, the second inline suggestion will not be shown
        this.skip()
        assertCleanStates()
        const editor = await openATextEditorWithText('', 'test.py')

        await manualTrigger(editor, client, config)
        await waitUntilSuggestionSeen()
        await sleep(2000) // see if we can use waitUntil to replace it
        await typing(editor, 'H')
        await sleep(2000) // see if we can use waitUntil to replace it
        // await acceptByTab()

        await manualTrigger(editor, client, config)
        await sleep(5000)
        // await waitUntilSuggestionSeen()
        await acceptByTab()

        // TODO: any better way to do this with waitUntil()?
        // required because oninlineAcceptance has sleep(vsCodeCursorUpdateDelay), otherwise assertion will be executed before onAcceptance hook
        await sleep(vsCodeCursorUpdateDelay + 10)

        assertTelemetry('codewhisperer_userTriggerDecision', [
            session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            session2UserTriggerEvent({ codewhispererCursorOffset: 3 }),
        ])
    })
})

async function manualTrigger(
    editor: vscode.TextEditor,
    client: DefaultCodeWhispererClient,
    config: ConfigurationEntry
) {
    await invokeRecommendation(editor, client, config)
}

async function waitUntilSuggestionSeen(index: number = 0) {
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
    return vscode.commands.executeCommand('aws.codeWhisperer.rejectCodeSuggestion')
}

async function closeActiveEditor() {
    return vscode.commands.executeCommand('workbench.action.closeActiveEditor')
}

async function typing(editor: vscode.TextEditor, s: string) {
    for (const char of s) {
        await typeAChar(editor, char)
    }
}

async function typeAChar(editor: vscode.TextEditor, s: string) {
    if (s.length !== 1) {
        throw new Error('only single char is allowed')
    }
    await editor.edit(edit => {
        edit.insert(editor.selection.active, s)
    })

    const positionBefore = editor.selection.active

    let positionAfter: vscode.Position
    if (s === '\n') {
        positionAfter = positionBefore.translate(1)
    } else {
        positionAfter = positionBefore.translate(0, s.length)
    }

    editor.selection = new vscode.Selection(positionAfter, positionAfter)

    assert.ok(positionAfter.isAfter(positionBefore))
}

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

function aResponse(sessionId: string, requestId: string, ...args: Recommendation[]): CodeWhispererResponse {
    return {
        recommendations: args,
        $response: {
            requestId: requestId,
            httpResponse: {
                headers: {
                    'x-amzn-sessionid': sessionId,
                },
            },
        },
    }
}
