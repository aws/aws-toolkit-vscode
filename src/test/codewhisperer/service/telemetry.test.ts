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

    // can refactor to single 1 function
    function aUserTriggerEvent(ops: Partial<CodewhispererUserTriggerDecision>): CodewhispererUserTriggerDecision {
        return {
            codewhispererSessionId: '',
            codewhispererFirstRequestId: '',
            codewhispererLanguage: 'python',
            codewhispererTriggerType: 'OnDemand',
            codewhispererLineNumber: 0,
            codewhispererCursorOffset: 0,
            codewhispererSuggestionCount: 0,
            codewhispererCompletionType: 'Line',
            codewhispererSuggestionState: 'Accept',
            codewhispererSuggestionImportCount: 0,
            codewhispererTypeaheadLength: 0,
            codewhispererUserGroup: 'Control',
            ...ops,
        }
    }

    function session1UserTriggerEvent(
        ops?: Partial<CodewhispererUserTriggerDecision>
    ): CodewhispererUserTriggerDecision {
        return aUserTriggerEvent({
            codewhispererSessionId: 'session_id_1',
            codewhispererFirstRequestId: 'request_id_1',
            codewhispererSuggestionCount: 3,
            ...ops,
        })
    }

    function session2UserTriggerEvent(
        ops?: Partial<CodewhispererUserTriggerDecision>
    ): CodewhispererUserTriggerDecision {
        return aUserTriggerEvent({
            codewhispererSessionId: 'session_id_2',
            codewhispererFirstRequestId: 'request_id_2',
            codewhispererSuggestionCount: 1,
            ...ops,
        })
    }

    function sesssion3UserTriggerEvent(
        ops?: Partial<CodewhispererUserTriggerDecision>
    ): CodewhispererUserTriggerDecision {
        return aUserTriggerEvent({
            codewhispererSessionId: 'session_id_3',
            codewhispererFirstRequestId: 'request_id_3',
            codewhispererSuggestionCount: 1,
            ...ops,
        })
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
        const response1_1 = aResponse(
            'session_id_1',
            'request_id_1',
            'fake-nextToken',
            { content: 'Foo' },
            { content: 'Bar' }
        )
        const response1_2 = aResponse('session_id_1', 'request_id_2', undefined, { content: 'FooFoo' })
        const response2 = aResponse('session_id_2', 'request_id_2', undefined, { content: 'Baz' })
        const response3 = aResponse('session_id_3', 'request_id_3', undefined, { content: 'Qoo' })

        const cwClient = new DefaultCodeWhispererClient()
        const stub = sandbox.stub(cwClient, 'listRecommendations')
        stub.onCall(0).resolves(response1_1)
        stub.onCall(1).resolves(response1_2)
        stub.onCall(2).resolves(response2)
        stub.onCall(3).resolves(response3)

        return cwClient
    }

    function assertSessionClean() {
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

    describe('tab and esc', function () {
        it('single accept', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await acceptByTab()
            assert.strictEqual(editor.document.getText(), 'Foo')

            assertTelemetry('codewhisperer_userTriggerDecision', [session1UserTriggerEvent()])
        })

        it('single reject', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await rejectByEsc()
            assert.strictEqual(editor.document.getText(), '')

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            ])
        })

        it('accept - accept - accept', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await acceptByTab()
            assert.strictEqual(editor.document.getText(), 'Foo')

            assertSessionClean()
            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await acceptByTab()
            assert.strictEqual(editor.document.getText(), 'FooBaz')

            const anotherEditor = await openATextEditorWithText('', 'anotherTest.py')
            assertSessionClean()
            await manualTrigger(anotherEditor, client, config)
            await waitUntilSuggestionSeen()
            await acceptByTab()
            assert.strictEqual(anotherEditor.document.getText(), 'Qoo')

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent(),
                session2UserTriggerEvent({ codewhispererCursorOffset: 3 }),
                sesssion3UserTriggerEvent(),
            ])
        })

        it('accept - reject - accept', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await acceptByTab()
            assert.strictEqual(editor.document.getText(), 'Foo')

            assertSessionClean()
            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await rejectByEsc()
            assert.strictEqual(editor.document.getText(), 'Foo')

            const anotherEditor = await openATextEditorWithText('', 'anotherTest.py')
            assertSessionClean()
            await manualTrigger(anotherEditor, client, config)
            await waitUntilSuggestionSeen()
            await rejectByEsc()
            assert.strictEqual(anotherEditor.document.getText(), '')

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent(),
                session2UserTriggerEvent({ codewhispererCursorOffset: 3, codewhispererSuggestionState: 'Reject' }),
                sesssion3UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            ])
        })

        it('multiple reject: esc key', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await rejectByEsc()
            assert.strictEqual(editor.document.getText(), '')

            assertSessionClean()
            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await rejectByEsc()
            assert.strictEqual(editor.document.getText(), '')

            assertSessionClean()
            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await rejectByEsc()
            assert.strictEqual(editor.document.getText(), '')

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
                session2UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
                sesssion3UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            ])
        })

        it('reject - accept - reject', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await rejectByEsc()
            assert.strictEqual(editor.document.getText(), '')

            assertSessionClean()
            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await acceptByTab()
            assert.strictEqual(editor.document.getText(), 'Baz')

            assertSessionClean()
            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await rejectByEsc()
            assert.strictEqual(editor.document.getText(), 'Baz')

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
                session2UserTriggerEvent(),
                sesssion3UserTriggerEvent({ codewhispererSuggestionState: 'Reject', codewhispererCursorOffset: 3 }),
            ])
        })
    })

    describe('typing', function () {
        it('typeahead match accept', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await typing(editor, 'F')
            assert.strictEqual(editor.document.getText(), 'F')
            await acceptByTab()
            assert.strictEqual(editor.document.getText(), 'Foo')

            assertTelemetry('codewhisperer_userTriggerDecision', [session1UserTriggerEvent()])
        })

        it('typeahead match, backspace and accept', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await typing(editor, 'F')
            assert.strictEqual(editor.document.getText(), 'F')
            await backsapce(editor)
            assert.strictEqual(editor.document.getText(), '')
            await acceptByTab()
            assert.strictEqual(editor.document.getText(), 'Foo')

            assertTelemetry('codewhisperer_userTriggerDecision', [session1UserTriggerEvent()])
        })

        it('typeahead match accept - reject - accept', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await typing(editor, 'F')
            assert.strictEqual(editor.document.getText(), 'F')
            await acceptByTab()
            assert.strictEqual(editor.document.getText(), 'Foo')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await rejectByEsc()
            assert.strictEqual(editor.document.getText(), 'Foo')

            const anotherEditor = await openATextEditorWithText('', 'anotherTest.py')
            await manualTrigger(anotherEditor, client, config)
            await waitUntilSuggestionSeen()
            await typing(anotherEditor, 'Qo')
            assert.strictEqual(anotherEditor.document.getText(), 'Qo')
            await acceptByTab()
            assert.strictEqual(anotherEditor.document.getText(), 'Qoo')

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent(),
                session2UserTriggerEvent({ codewhispererCursorOffset: 3, codewhispererSuggestionState: 'Reject' }),
                sesssion3UserTriggerEvent(),
            ])
        })

        it('typeahead not match after suggestion is shown and reject', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await typing(editor, 'H')
            assert.strictEqual(editor.document.getText(), 'H')

            RecommendationHandler.instance.onEditorChange()

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            ])
        })

        it('reject - typeahead not matching after suggestion is shown then invoke another round and accept', async function () {
            // no idea why this one doesn't work, the second inline suggestion will not be shown
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await typing(editor, 'H')
            assert.strictEqual(editor.document.getText(), 'H')

            const anotherEditor = await openATextEditorWithText('', 'anotherTest.py')
            await manualTrigger(anotherEditor, client, config)
            await waitUntilSuggestionSeen()
            await acceptByTab()
            assert.strictEqual(anotherEditor.document.getText(), 'Baz')

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
                session2UserTriggerEvent(),
            ])
        })
    })

    describe('on editor change, focus change', function () {
        it('reject: trigger then open another editor', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py', tempFolder, { preview: false })

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()

            await openATextEditorWithText('text in 2nd editor', 'another1.py', tempFolder, {
                preview: false,
            })
            const anotherEditor = await openATextEditorWithText('text in 3rd editor', 'another2.py', tempFolder, {
                preview: false,
            })

            assert.strictEqual(vscode.window.activeTextEditor, anotherEditor)
            assert.strictEqual(editor.document.getText(), '')
            await assertTabCount(3)
            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            ])
        })

        it('reject: trigger then close editor', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            await closeActiveEditor()
            assert.strictEqual(editor.document.getText(), '')

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            ])
        })

        it('reject: onFocusChange', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await waitUntilSuggestionSeen()
            assert.strictEqual(editor.document.getText(), '')

            await RecommendationHandler.instance.onFocusChange()
            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            ])
        })
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

async function acceptByTab() {
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit')

    // required because oninlineAcceptance has sleep(vsCodeCursorUpdateDelay), otherwise assertion will be executed before onAcceptance hook
    await sleep(vsCodeCursorUpdateDelay + 10)
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
    await sleep(2000) // see if we can use waitUntil to replace it
}

async function backsapce(editor: vscode.TextEditor) {
    // const beforeLength = editor.document.getText.length
    // const selected = editor.document.getText(new vscode.Range(editor.selection.start, editor.selection.end))
    // if (selected.length === 0) {
    //     return
    // }

    // await editor.edit(edit => {
    //     edit.delete(editor.selection)
    // })

    // const afterLength = editor.document.getText.length
    // assert.strictEqual(afterLength + selected.length, beforeLength)
    // await sleep(2000) // see if we can use waitUntil to replace it
    // assert cusor?

    return vscode.commands.executeCommand('deleteLeft')
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

function aResponse(
    sessionId: string,
    requestId: string,
    nextToken: string | undefined,
    ...args: Recommendation[]
): CodeWhispererResponse {
    return {
        recommendations: args,
        nextToken: nextToken,
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
