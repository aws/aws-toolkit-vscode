/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import {
    closeAllEditors,
    getTestWindow,
    registerAuthHook,
    resetCodeWhispererGlobalVariables,
    TestFolder,
    toTextEditor,
    using,
} from 'aws-core-vscode/test'
import { RecommendationHandler, RecommendationService, session } from 'aws-core-vscode/codewhisperer'
import { Commands, globals, sleep, waitUntil, collectionUtil } from 'aws-core-vscode/shared'
import { loginToIdC } from '../amazonq/utils/setup'

describe('Amazon Q Inline', async function () {
    const retries = 3
    this.retries(retries)

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
        await resetCodeWhispererGlobalVariables()
    })

    afterEach(async function () {
        await closeAllEditors()
        if (this.currentTest?.state === undefined || this.currentTest?.isFailed() || this.currentTest?.isPending()) {
            logUserDecisionStatus()
        }
    })

    function logUserDecisionStatus() {
        const events = getUserTriggerDecision()
        console.table({
            'telemetry events': JSON.stringify(events),
            'recommendation service status': RecommendationService.instance.isRunning,
        })
    }

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
        const suggestionShown = await waitUntil(async () => session.getSuggestionState(0) === 'Showed', waitOptions)
        if (!suggestionShown) {
            throw new Error(`Suggestion did not show. Suggestion States: ${JSON.stringify(session.suggestionStates)}`)
        }
        const suggestionVisible = await waitUntil(
            async () => RecommendationHandler.instance.isSuggestionVisible(),
            waitOptions
        )
        if (!suggestionVisible) {
            throw new Error(
                `Suggestions failed to become visible. Suggestion States: ${JSON.stringify(session.suggestionStates)}`
            )
        }
        console.table({
            'suggestions states': JSON.stringify(session.suggestionStates),
            'valid recommendation': RecommendationHandler.instance.isValidResponse(),
            'recommendation service status': RecommendationService.instance.isRunning,
            recommendations: session.recommendations,
        })
        if (!RecommendationHandler.instance.isValidResponse()) {
            throw new Error('Did not find a valid response')
        }
    }

    /**
     * Waits for a specific telemetry event to be emitted with the expected suggestion state.
     * It looks like there might be a potential race condition in codewhisperer causing telemetry
     * events to be emitted in different orders
     */
    async function waitForTelemetry(metricName: string, suggestionState: string) {
        const ok = await waitUntil(async () => {
            const events = globals.telemetry.logger.query({
                metricName,
            })
            return events.some((event) => event.codewhispererSuggestionState === suggestionState)
        }, waitOptions)
        if (!ok) {
            assert.fail(`Telemetry for ${metricName} with suggestionState ${suggestionState} was not emitted`)
        }
        const events = getUserTriggerDecision()
        if (events.length > 1 && events[events.length - 1].codewhispererSuggestionState !== suggestionState) {
            assert.fail(`Telemetry events were emitted in the wrong order`)
        }
    }

    function getUserTriggerDecision() {
        return globals.telemetry.logger
            .query({
                metricName: 'codewhisperer_userTriggerDecision',
            })
            .map((e) => collectionUtil.partialClone(e, 3, ['credentialStartUrl'], { replacement: '[omitted]' }))
    }

    for (const [name, invokeCompletion] of [
        ['automatic', async () => await vscode.commands.executeCommand('type', { text: '\n' })],
        ['manual', async () => Commands.tryExecute('aws.amazonq.invokeInlineCompletion')],
    ] as const) {
        describe(`${name} invoke`, async function () {
            let originalEditorContents: string | undefined

            describe('supported filetypes', () => {
                async function setup() {
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
                }

                beforeEach(async () => {
                    /**
                     * Every once and a while the backend won't respond with any recommendations.
                     * In those cases, re-try the setup up-to ${retries} times
                     */
                    let attempt = 0
                    while (attempt < retries) {
                        try {
                            await setup()
                            console.log(`test run ${attempt} succeeded`)
                            logUserDecisionStatus()
                            break
                        } catch (e) {
                            console.log(`test run ${attempt} failed`)
                            console.log(e)
                            logUserDecisionStatus()
                            attempt++
                            await resetCodeWhispererGlobalVariables()
                        }
                    }
                    if (attempt === retries) {
                        assert.fail(`Failed to invoke ${name} tests after ${attempt} attempts`)
                    }
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

                    await waitForTelemetry('codewhisperer_userTriggerDecision', 'Accept')
                })

                it(`${name} invoke reject`, async function () {
                    // Reject the suggestion
                    await vscode.commands.executeCommand('aws.amazonq.rejectCodeSuggestion')

                    // Contents haven't changed
                    assert.deepStrictEqual(vscode.window.activeTextEditor?.document.getText(), originalEditorContents)
                    await waitForTelemetry('codewhisperer_userTriggerDecision', 'Reject')
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
