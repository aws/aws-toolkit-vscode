/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import {
    assertTelemetry,
    closeAllEditors,
    getTestWindow,
    registerAuthHook,
    resetCodeWhispererGlobalVariables,
    TestFolder,
    toTextEditor,
    using,
} from 'aws-core-vscode/test'
import { RecommendationHandler, RecommendationService } from 'aws-core-vscode/codewhisperer'
import { Commands, globals, sleep, waitUntil } from 'aws-core-vscode/shared'
import { loginToIdC } from '../amazonq/utils/setup'

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
        await closeAllEditors()
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

    async function waitForRecommendations() {
        const ok = await waitUntil(async () => RecommendationHandler.instance.isSuggestionVisible(), waitOptions)
        if (!ok) {
            assert.fail('Suggestions failed to become visible')
        }
    }

    async function waitForTelemetry() {
        const ok = await waitUntil(
            async () =>
                globals.telemetry.logger.query({
                    metricName: 'codewhisperer_userTriggerDecision',
                }).length > 0,
            waitOptions
        )
        if (!ok) {
            assert.fail('Telemetry failed to be emitted')
        }
    }

    for (const [name, invokeCompletion] of [
        ['automatic', async () => await vscode.commands.executeCommand('type', { text: '\n' })],
        ['manual', async () => Commands.tryExecute('aws.amazonq.invokeInlineCompletion')],
    ] as const) {
        describe(`${name} invoke`, async function () {
            let originalEditorContents: string | undefined

            describe('supported filetypes', () => {
                beforeEach(async () => {
                    await setupEditor()

                    /**
                     * Allow some time between when the editor is opened and when we start typing.
                     * If we don't do this then the time between the initial editor selection
                     * and invoking the "type" command is too low, causing completion to never
                     * activate. AFAICT there isn't anything we can use waitUntil on here.
                     *
                     * note: this number is entirely arbitrary
                     **/
                    await sleep(1000)

                    await invokeCompletion()
                    originalEditorContents = vscode.window.activeTextEditor?.document.getText()

                    // wait until the ghost text appears
                    await waitForRecommendations()
                })

                it(`${name} invoke accept`, async function () {
                    /**
                     * keep accepting the suggestion until the text contents change
                     * this is required because we have no access to the inlineSuggest panel
                     **/
                    const suggestionAccepted = await waitUntil(async () => {
                        // Accept the suggestion
                        await vscode.commands.executeCommand('editor.action.inlineSuggest.commit')
                        return vscode.window.activeTextEditor?.document.getText() !== originalEditorContents
                    }, waitOptions)

                    assert.ok(suggestionAccepted, 'Editor contents should have changed')

                    await waitForTelemetry()
                    assertTelemetry('codewhisperer_userTriggerDecision', {
                        codewhispererSuggestionState: 'Accept',
                    })
                })

                it(`${name} invoke reject`, async function () {
                    // Reject the suggestion
                    await vscode.commands.executeCommand('aws.amazonq.rejectCodeSuggestion')

                    // Contents haven't changed
                    assert.deepStrictEqual(vscode.window.activeTextEditor?.document.getText(), originalEditorContents)

                    await waitForTelemetry()
                    assertTelemetry('codewhisperer_userTriggerDecision', {
                        codewhispererSuggestionState: 'Reject',
                    })
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

            it(`${name} invoke on unsupported filetype`, async function () {
                await setupEditor({
                    name: 'test.zig',
                    contents: `fn doSomething() void {
        
             }`,
                })

                /**
                 * Add delay between editor loading and invoking completion
                 * @see beforeEach in supported filetypes for more information
                 */
                await sleep(1000)
                await invokeCompletion()

                if (name === 'automatic') {
                    // It should never get triggered since its not a supported file type
                    assert.deepStrictEqual(RecommendationService.instance.isRunning, false)
                } else {
                    await getTestWindow().waitForMessage('currently not supported by Amazon Q inline suggestions')
                }
            })
        })
    }
})
