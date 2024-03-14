/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { qTestingFramework } from './framework/framework'
import sinon from 'sinon'
import { verifyTextOrder } from './framework/text'
import { registerAuthHook, using } from '../../test/setupUtil'
import { loginToIdC } from './utils/setup'
import { Messenger } from './framework/messenger'
import { FollowUpTypes } from '../../amazonqFeatureDev/types'
import { examples, newTaskChanges, sessionClosed } from '../../amazonqFeatureDev/userFacingText'
import { ChatItem } from '@aws/mynah-ui'
import { sleep } from '../../shared/utilities/timeoutUtils'

describe('Amazon Q Feature Dev', function () {
    let framework: qTestingFramework
    let tab: Messenger

    const maxTestDuration = 600000
    const prompt = 'Implement fibonacci in typescript'
    const iterateApproachPrompt = prompt + ' and add tests'
    const codegenApproachPrompt = prompt + ' and add even more tests'
    const tooManyRequestsWaitTime = 100000

    before(async function () {
        /**
         * The tests are getting throttled, only run them on stable for now
         *
         * TODO: Re-enable for all versions once the backend can handle them
         */
        if (process.env['VSCODE_TEST_VERSION'] !== 'stable') {
            this.skip()
        }

        await using(registerAuthHook('amazonq-test-account'), async () => {
            await loginToIdC()
        })
    })

    beforeEach(() => {
        registerAuthHook('amazonq-test-account')
        framework = new qTestingFramework('featuredev', true, true)
        tab = framework.createTab()
    })

    afterEach(() => {
        framework.removeTab(tab.tabID)
        framework.dispose()
        sinon.restore()
    })

    describe('quick action availability', () => {
        it('Shows /dev when feature dev is enabled', async () => {
            const command = tab.findCommand('/dev')
            if (!command) {
                assert.fail('Could not find command')
            }

            if (command.length > 1) {
                assert.fail('Found too many commands with the name /dev')
            }
        })

        it('Does NOT show /dev when feature dev is NOT enabled', () => {
            // The beforeEach registers a framework which accepts requests. If we don't dispose before building a new one we have duplicate messages
            framework.dispose()
            framework = new qTestingFramework('featuredev', false, true)
            const tab = framework.createTab()
            const command = tab.findCommand('/dev')
            if (command.length > 0) {
                assert.fail('Found command when it should not have been found')
            }
        })
    })

    function waitForButtons(buttons: FollowUpTypes[]) {
        return tab.waitForEvent(() => {
            return buttons.every(value => tab.hasButton(value))
        })
    }

    async function waitForText(text: string) {
        await tab.waitForEvent(
            () => {
                return tab.getChatItems().some(chatItem => chatItem.body === text)
            },
            {
                waitIntervalInMs: 250,
                waitTimeoutInMs: 2000,
            }
        )
    }

    function verifyApproachState(chatItems: ChatItem[], expectedResponses: RegExp[]) {
        // Verify that all the responses come back in the correct order
        verifyTextOrder(chatItems, expectedResponses)

        // Check that the UI has the two buttons
        assert.notStrictEqual(chatItems.pop()?.followUp?.options, [
            {
                type: FollowUpTypes.GenerateCode,
                disabled: false,
            },
        ])
    }

    async function iterate(prompt: string) {
        tab.addChatMessage({ prompt })

        await retryIfRequired(
            async () => {
                // Wait for a backend response
                await tab.waitForChatFinishesLoading()
            },
            () => {
                tab.addChatMessage({ prompt })
            }
        )
    }

    /**
     * Wait for the original request to finish.
     * If the response has a retry button or encountered a guardrails error, continue retrying
     *
     * This allows the e2e tests to recover from potential one off backend problems/random guardrails
     */
    async function retryIfRequired(waitUntilReady: () => Promise<void>, request?: () => void) {
        await waitUntilReady()

        const findAnotherTopic = 'find another topic to discuss'
        const tooManyRequests = 'Too many requests'
        const failureState = (message: string) => {
            return (
                tab.getChatItems().pop()?.body?.includes(message) ||
                tab.getChatItems().slice(-2).shift()?.body?.includes(message)
            )
        }
        while (
            tab.hasButton(FollowUpTypes.Retry) ||
            (request && (failureState(findAnotherTopic) || failureState(tooManyRequests)))
        ) {
            if (tab.hasButton(FollowUpTypes.Retry)) {
                console.log('Retrying request')
                tab.clickButton(FollowUpTypes.Retry)
                await waitUntilReady()
            } else if (failureState(tooManyRequests)) {
                // 3 versions of the e2e tests are running at the same time in the ci so we occassionally need to wait before continuing
                request && request()
                await sleep(tooManyRequestsWaitTime)
            } else {
                // We've hit guardrails, re-make the request and wait again
                request && request()
                await waitUntilReady()
            }
        }

        // The backend never recovered
        if (tab.hasButton(FollowUpTypes.SendFeedback)) {
            assert.fail('Encountered an error when attempting to call the feature dev backend. Could not continue')
        }
    }

    const functionalTests = () => {
        afterEach(async function () {
            // currentTest.state is undefined if a beforeEach fails
            if (
                this.currentTest?.state === undefined ||
                this.currentTest?.isFailed() ||
                this.currentTest?.isPending()
            ) {
                // Since the tests are long running this may help in diagnosing the issue
                console.log('Current chat items at failure')
                console.log(JSON.stringify(tab.getChatItems(), undefined, 4))
            }
        })

        it('Should receive chat response', async () => {
            verifyApproachState(tab.getChatItems(), [new RegExp(prompt), /.\S/])
        })

        describe('Moves directly from approach to codegen', () => {
            codegenTests()
        })

        describe('Iterates on approach', () => {
            beforeEach(async function () {
                this.timeout(maxTestDuration)
                await iterate(iterateApproachPrompt)
            })

            it('Should iterate successfully', () => {
                verifyApproachState(tab.getChatItems(), [new RegExp(prompt), /.\S/])
            })

            describe('Moves to codegen after iteration', () => {
                codegenTests()
            })
        })

        function codegenTests() {
            beforeEach(async function () {
                this.timeout(maxTestDuration)
                tab.clickButton(FollowUpTypes.GenerateCode)
                await retryIfRequired(async () => {
                    await Promise.any([
                        waitForButtons([FollowUpTypes.InsertCode, FollowUpTypes.ProvideFeedbackAndRegenerateCode]),
                        waitForButtons([FollowUpTypes.Retry]),
                    ])
                })
            })

            describe('Clicks accept code', () => {
                insertCodeTests()
            })

            describe('Iterates on codegen', () => {
                beforeEach(async function () {
                    this.timeout(maxTestDuration)
                    tab.clickButton(FollowUpTypes.ProvideFeedbackAndRegenerateCode)
                    await tab.waitForChatFinishesLoading()
                    await iterate(codegenApproachPrompt)
                })

                describe('Clicks accept code', () => {
                    insertCodeTests()
                })
            })
        }

        function insertCodeTests() {
            beforeEach(async function () {
                this.timeout(maxTestDuration)
                tab.clickButton(FollowUpTypes.InsertCode)
                await waitForButtons([FollowUpTypes.NewTask, FollowUpTypes.CloseSession])
            })

            it('clicks new task', async () => {
                tab.clickButton(FollowUpTypes.NewTask)
                await waitForText(newTaskChanges)
                assert.deepStrictEqual(tab.getChatItems().pop()?.body, newTaskChanges)
            })

            it('click close session', async () => {
                tab.clickButton(FollowUpTypes.CloseSession)
                await waitForText(sessionClosed)
                assert.deepStrictEqual(tab.getPlaceholder(), sessionClosed)
            })
        }
    }

    describe('/dev {msg} entry', async () => {
        beforeEach(async function () {
            this.timeout(maxTestDuration)
            tab.addChatMessage({ command: '/dev', prompt })
            await retryIfRequired(
                async () => {
                    await tab.waitForChatFinishesLoading()
                },
                () => {
                    tab.addChatMessage({ prompt })
                }
            )
        })

        functionalTests()
    })

    describe('/dev entry', () => {
        beforeEach(async function () {
            this.timeout(maxTestDuration)
            tab.addChatMessage({ command: '/dev' })
            tab.addChatMessage({ prompt })
            await retryIfRequired(
                async () => {
                    await tab.waitForChatFinishesLoading()
                },
                () => {
                    tab.addChatMessage({ prompt })
                }
            )
        })

        it('Clicks examples', async () => {
            const q = framework.createTab()
            q.addChatMessage({ command: '/dev' })
            q.clickButton(FollowUpTypes.DevExamples)

            const lastChatItems = q.getChatItems().pop()
            assert.deepStrictEqual(lastChatItems?.body, examples)
        })

        functionalTests()
    })
})
