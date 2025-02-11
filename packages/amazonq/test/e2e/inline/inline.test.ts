/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import {
    closeAllEditors,
    // getTestWindow,
    registerAuthHook,
    resetCodeWhispererGlobalVariables,
    TestFolder,
    toTextEditor,
    using,
} from 'aws-core-vscode/test'
import { Commands, globals, sleep, waitUntil } from 'aws-core-vscode/shared'
import { loginToIdC } from '../amazonq/utils/setup'
import { rejectByEsc, waitUntilSuggestionSeen } from '../../unit/codewhisperer/testUtil'

describe('Amazon Q Inline', async function () {
    let tempFolder: string
    const waitOptions = {
        interval: 500,
        timeout: 10000,
        retryOnFail: false,
    }

    before(async function () {
        await using(registerAuthHook('amazonq-test-account'), async () => {
            await loginToIdC()
        })
    })

    beforeEach(async function () {
        registerAuthHook('amazonq-test-account')
        const folder = await TestFolder.create()
        tempFolder = folder.path
        await closeAllEditors()
        await resetCodeWhispererGlobalVariables(false)
    })

    afterEach(async function () {
        if (this.currentTest === undefined || this.currentTest.isFailed()) {
            console.log('editor contents:\n %O', vscode.window.activeTextEditor?.document.getText())
            const suggestionStates = globals.telemetry.logger
                .query({
                    metricName: 'codewhisperer_userTriggerDecision',
                })
                .map((item) => item.codewhispererSuggestionState)

            console.log(`telemetry:\n %O`, suggestionStates)
        }
        await closeAllEditors()

        // for some reason multiple codewhisperer events are kicking off at the same time??
        await sleep(10000)
    })

    async function setupEditor({ name, contents }: { name?: string; contents?: string } = {}) {
        const fileName = name ?? 'test.ts'
        const textContents =
            contents ??
            `function fib() {


}`
        await toTextEditor(textContents, fileName, tempFolder, {
            selection: new vscode.Range(new vscode.Position(1, 4), new vscode.Position(1, 4)),
        })
    }

    async function lastTriggerDecision() {
        const ok = await waitUntil(async () => {
            const telem = globals.telemetry.logger.query({
                metricName: 'codewhisperer_userTriggerDecision',
            })
            for (const item of telem) {
                console.log(`suggestionState: %O`, item.codewhispererSuggestionState)
            }
            return telem.some((item) => item.codewhispererSuggestionState !== 'Empty')
        }, waitOptions)
        if (!ok) {
            console.log(globals.telemetry.logger.list())
            assert.fail('Telemetry failed to be emitted')
        }

        const events = globals.telemetry.logger.query({
            metricName: 'codewhisperer_userTriggerDecision',
        })
        return events[events.length - 1].codewhispererSuggestionState
    }

    for (const [name, invokeCompletion] of [
        // ['automatic', async () => await vscode.commands.executeCommand('type', { text: '\n' })],
        ['manual', async () => await Commands.tryExecute('aws.amazonq.invokeInlineCompletion')],
    ] as const) {
        describe(`${name} invoke`, async function () {
            let originalEditorContents: string | undefined

            describe('supported filetypes', () => {
                beforeEach(async () => {
                    console.log('manually setting up editor')
                    await setupEditor()

                    /**
                     * Allow some time between when the editor is opened and when we start typing.
                     * If we don't do this then the time between the initial editor selection
                     * and invoking the "type" command is too low, causing completion to never
                     * activate. AFAICT there isn't anything we can use waitUntil on here.
                     *
                     * note: this number is entirely arbitrary
                     **/
                    console.log('sleeping')
                    await sleep(1000)

                    console.log('invoking')
                    await invokeCompletion()
                    originalEditorContents = vscode.window.activeTextEditor?.document.getText()

                    console.log('waiting for recommendations')
                    // wait until the ghost text appears
                    await waitUntilSuggestionSeen()
                })

                it(`${name} invoke accept`, async function () {
                    /**
                     * keep accepting the suggestion until the text contents change
                     * this is required because we have no access to the inlineSuggest panel
                     **/
                    const suggestionAccepted = await waitUntil(async () => {
                        // Accept the suggestion
                        await vscode.commands.executeCommand('editor.action.inlineSuggest.commit')
                        console.log(vscode.window.activeTextEditor?.document.getText())
                        return vscode.window.activeTextEditor?.document.getText() !== originalEditorContents
                    }, waitOptions)

                    assert.ok(suggestionAccepted, 'Editor contents should have changed')
                    const decision = await lastTriggerDecision()
                    assert.deepStrictEqual(decision, 'Accept')
                })

                it(`${name} invoke reject`, async function () {
                    await rejectByEsc()

                    // Contents haven't changed
                    assert.deepStrictEqual(vscode.window.activeTextEditor?.document.getText(), originalEditorContents)

                    const decision = await lastTriggerDecision()
                    assert.deepStrictEqual(decision, 'Reject')
                })

                it(`${name} invoke discard`, async function () {
                    // Discard the suggestion by moving it back to the original position
                    const position = new vscode.Position(1, 4)
                    const editor = vscode.window.activeTextEditor
                    if (!editor) {
                        assert.fail('Could not find text editor')
                    }
                    editor.selection = new vscode.Selection(position, position)

                    // Contents are the same
                    assert.deepStrictEqual(vscode.window.activeTextEditor?.document.getText(), originalEditorContents)
                })
            })

            // it(`${name} invoke on unsupported filetype`, async function () {
            //     await setupEditor({
            //         name: 'test.zig',
            //         contents: `fn doSomething() void {

            //  }`,
            //     })

            //     /**
            //      * Add delay between editor loading and invoking completion
            //      * @see beforeEach in supported filetypes for more information
            //      */
            //     await sleep(1000)
            //     await invokeCompletion()

            //     // if (name === 'automatic') {
            //     // It should never get triggered since its not a supported file type
            //     // assert.deepStrictEqual(RecommendationService.instance.isRunning, false)
            //     // } else {
            //     await getTestWindow().waitForMessage('currently not supported by Amazon Q inline suggestions')
            //     // }
            // })
        })
    }
})
