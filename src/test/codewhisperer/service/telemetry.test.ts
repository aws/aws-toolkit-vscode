/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import os from 'os'
import * as vscode from 'vscode'
import sinon from 'sinon'
import semver from 'semver'
import {
    assertTabCount,
    assertTelemetry,
    assertTextEditorContains,
    createTestWorkspaceFolder,
    openATextEditorWithText,
} from '../../testUtil'
import {
    DefaultCodeWhispererClient,
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
import { getMinVscodeVersion } from '../../../shared/vscode/env'

type CodeWhispererResponse = ListRecommendationsResponse & {
    $response: { requestId: string; httpResponse: { headers: { [key: string]: string } } }
}

let tempFolder: string

describe.skip('CodeWhisperer telemetry', async function () {
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
            codewhispererSuggestionCount: 2,
            codewhispererCompletionType: 'Block',
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
        const response11 = aResponse(
            'session_id_1',
            'request_id_1',
            'fake-nextToken',
            { content: 'Foo' },
            { content: 'Bar\nBar' }
        )
        const response12 = aResponse('session_id_1', 'request_id_1_2', undefined, { content: 'FooFoo' })
        const response2 = aResponse(
            'session_id_2',
            'request_id_2',
            undefined,
            { content: 'Baz\nBaz' },
            { content: 'Baz' }
        )
        const response3 = aResponse('session_id_3', 'request_id_3', undefined, { content: 'Qoo' })

        const cwClient = new DefaultCodeWhispererClient()
        const stub = sandbox.stub(cwClient, 'listRecommendations')
        stub.onCall(0).resolves(response11)
        stub.onCall(1).resolves(response12)
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

    describe('tab and esc', function () {
        it('single accept', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await acceptByTab()
            assertTextEditorContains('Foo')
            assertTelemetry('codewhisperer_userTriggerDecision', [session1UserTriggerEvent()])
        })

        it('single reject', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await rejectByEsc()
            assertTextEditorContains('')

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            ])
        })

        it('accept - accept - accept', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await acceptByTab()
            assertTextEditorContains('Foo')

            assertSessionClean()
            await manualTrigger(editor, client, config)
            await acceptByTab()
            assertTextEditorContains(`FooBaz${os.EOL}Baz`)

            const anotherEditor = await openATextEditorWithText('', 'anotherTest.py')
            assertSessionClean()
            await manualTrigger(anotherEditor, client, config)
            await acceptByTab()
            assertTextEditorContains('Qoo')

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
            await acceptByTab()
            assertTextEditorContains('Foo')

            assertSessionClean()
            await manualTrigger(editor, client, config)
            await rejectByEsc()
            assertTextEditorContains('Foo')

            const anotherEditor = await openATextEditorWithText('', 'anotherTest.py')
            assertSessionClean()
            await manualTrigger(anotherEditor, client, config)
            await rejectByEsc()
            assertTextEditorContains('')

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent(),
                session2UserTriggerEvent({ codewhispererCursorOffset: 3, codewhispererSuggestionState: 'Reject' }),
                sesssion3UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            ])
        })

        it('reject - reject - reject', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await rejectByEsc()
            assertTextEditorContains('')

            assertSessionClean()
            await manualTrigger(editor, client, config)
            await rejectByEsc()
            assertTextEditorContains('')

            assertSessionClean()
            await manualTrigger(editor, client, config)
            await rejectByEsc()
            assertTextEditorContains('')

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
            await rejectByEsc()
            assertTextEditorContains('')

            assertSessionClean()
            await manualTrigger(editor, client, config)
            await acceptByTab()
            assertTextEditorContains(`Baz${os.EOL}Baz`)

            assertSessionClean()
            await manualTrigger(editor, client, config)
            await rejectByEsc()
            assertTextEditorContains(`Baz${os.EOL}Baz`)

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
                session2UserTriggerEvent(),
                sesssion3UserTriggerEvent({
                    codewhispererSuggestionState: 'Reject',
                    codewhispererCursorOffset: 7 + (os.EOL.length - 1),
                    codewhispererLineNumber: 1,
                }),
            ])
        })
    })

    describe('navigation', function () {
        // as per vscode official repo PR https://github.com/microsoft/vscode/commit/cb0e59c56677181b570b110167d13efb4ba7677d#diff-84b7f4a5ab7c383d86e2d40e2c704d255dc1e187a29386c036023a4696196556R19
        // navigation commands seem to be introduced since 1.78.0
        function shouldRun() {
            const version = getMinVscodeVersion()
            if (semver.gte(version, '1.78.0')) {
                throw new Error('Minimum VSCode version is greater than 1.78.0, this check should be removed')
            }

            return semver.valid(vscode.version) && semver.gte(vscode.version, '1.78.0')
        }

        it('next and accept', async function () {
            if (!shouldRun()) {
                this.skip()
            }

            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await navigateNext()
            await acceptByTab()
            assertTextEditorContains(`Bar${os.EOL}Bar`)

            assertTelemetry('codewhisperer_userTriggerDecision', [session1UserTriggerEvent()])
        })

        it('next and reject', async function () {
            if (!shouldRun()) {
                this.skip()
            }

            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await navigateNext()
            await rejectByEsc()
            assertTextEditorContains('')

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            ])
        })

        it('next and accept', async function () {
            if (!shouldRun()) {
                this.skip()
            }

            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await navigateNext()
            await navigatePrev()
            await acceptByTab()
            assertTextEditorContains('Foo')

            assertTelemetry('codewhisperer_userTriggerDecision', [session1UserTriggerEvent()])
        })
    })

    describe('typing', function () {
        it('typeahead match accept', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await typing(editor, 'F')
            assertTextEditorContains('F')

            await acceptByTab()
            assertTextEditorContains('Foo')

            assertTelemetry('codewhisperer_userTriggerDecision', [session1UserTriggerEvent()])
        })

        it('typeahead match, backspace and accept', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await typing(editor, 'F')
            assertTextEditorContains('F')

            await backspace(editor)
            assertTextEditorContains('')

            await acceptByTab()
            assertTextEditorContains('Foo')

            assertTelemetry('codewhisperer_userTriggerDecision', [session1UserTriggerEvent()])
        })

        it('typeahead match accept - reject - accept', async function () {
            // TODO: skipping because in some machines, acceptByTab('Foo') right after typing('F') will result in 'FFoo'
            // the solution is to waitUntil VSCode InlineSuggestion to resolve the "typeahead" but currently no easy way to know if the InlinSuggestion is shown visible again
            this.skip()
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await typing(editor, 'F')
            assertTextEditorContains('F')

            await acceptByTab()
            assertTextEditorContains('Foo')

            await manualTrigger(editor, client, config)
            await rejectByEsc()
            assertTextEditorContains('Foo')

            const anotherEditor = await openATextEditorWithText('', 'anotherTest.py')
            await manualTrigger(anotherEditor, client, config)
            await typing(anotherEditor, 'Qo')
            assertTextEditorContains('Qo')

            await acceptByTab()
            assertTextEditorContains('Qoo')

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
            await typing(editor, 'H')
            assertTextEditorContains('H')

            // states will not be cleaned until reportUserDecision is called
            assert.strictEqual(session.sessionId, 'session_id_1')
            assert.deepStrictEqual(session.requestIdList, ['request_id_1', 'request_id_1', 'request_id_1_2'])

            RecommendationHandler.instance.onEditorChange()
            assertSessionClean()
            await backspace(editor) // todo: without this, the following manual trigger will not be displayed in the test, investigate and fix it

            await manualTrigger(editor, client, config)
            await acceptByTab()
            assertTextEditorContains(`Baz${os.EOL}Baz`)

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
                session2UserTriggerEvent(),
            ])
        })

        it('reject - typeahead not matching after suggestion is shown then invoke another round and accept', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await typing(editor, 'H')
            assertTextEditorContains('H')

            const anotherEditor = await openATextEditorWithText('', 'anotherTest.py')
            await manualTrigger(anotherEditor, client, config)
            await acceptByTab()
            assertTextEditorContains(`Baz${os.EOL}Baz`)

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

            await openATextEditorWithText('text in 2nd editor', 'another1.py', tempFolder, {
                preview: false,
            })
            const anotherEditor = await openATextEditorWithText('text in 3rd editor', 'another2.py', tempFolder, {
                preview: false,
            })

            assert.strictEqual(vscode.window.activeTextEditor, anotherEditor)
            assertTextEditorContains('')
            await assertTabCount(3)
            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            ])
        })

        it('reject: trigger then close editor', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            await closeActiveEditor()
            assertTextEditorContains('')

            assertTelemetry('codewhisperer_userTriggerDecision', [
                session1UserTriggerEvent({ codewhispererSuggestionState: 'Reject' }),
            ])
        })

        it('reject: onFocusChange', async function () {
            assertSessionClean()
            const editor = await openATextEditorWithText('', 'test.py')

            await manualTrigger(editor, client, config)
            assertTextEditorContains('')

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
    await waitUntilSuggestionSeen()
}

// Note: RecommendationHandler.isSuggestionVisible seems not to work well, hence not using it
async function waitUntilSuggestionSeen(index: number = 0) {
    const state = await waitUntil(
        async () => {
            const r = session.getSuggestionState(index)
            if (r) {
                return r
            }
        },
        {
            interval: 500,
        }
    )

    assert.ok(state === 'Showed')
}

async function acceptByTab() {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        throw new Error('no active editor')
    }
    const originalContent = editor.document.getText()
    // we have to wait until the inline suggestion is shown in the editor however we don't have an useable API for that so hacky wait to know if the accept is taking effect
    await waitUntil(
        async () => {
            await sleep(50)
            await vscode.commands.executeCommand('editor.action.inlineSuggest.commit')
            if (editor.document.getText() !== originalContent) {
                return true
            }
        },
        { interval: 10 }
    )

    // required because oninlineAcceptance has sleep(vsCodeCursorUpdateDelay), otherwise assertion will be executed "before" onAcceptance hook
    await sleep(vsCodeCursorUpdateDelay + 50)
}

async function rejectByEsc() {
    return vscode.commands.executeCommand('aws.codeWhisperer.rejectCodeSuggestion')
}

async function navigateNext() {
    return vscode.commands.executeCommand('editor.action.inlineSuggest.showNext')
}

async function navigatePrev() {
    return vscode.commands.executeCommand('editor.action.inlineSuggest.showPrevious')
}

async function closeActiveEditor() {
    return vscode.commands.executeCommand('workbench.action.closeActiveEditor')
}

async function typing(editor: vscode.TextEditor, s: string) {
    const initialContent = editor.document.getText()
    const positionBefore = editor.document.offsetAt(editor.selection.active)

    await editor.edit(edit => {
        edit.insert(editor.selection.active, s)
    })

    assertTextEditorContains(initialContent + s)
    await waitUntil(
        async () => {
            const positionPendingUpdate = editor.document.offsetAt(editor.selection.active)
            if (positionPendingUpdate === positionBefore + s.length) {
                return true
            }
        },
        { interval: 50 }
    )
    const positionAfter = editor.document.offsetAt(editor.selection.active)
    assert.strictEqual(positionAfter, positionBefore + s.length)
}

async function backspace(editor: vscode.TextEditor) {
    return vscode.commands.executeCommand('deleteLeft')
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
