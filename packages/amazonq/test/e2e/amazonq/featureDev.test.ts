/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { qTestingFramework } from './framework/framework'
import sinon from 'sinon'
import { registerAuthHook, using } from 'aws-core-vscode/test'
import { loginToIdC } from './utils/setup'
import { Messenger } from './framework/messenger'
import { FollowUpTypes, examples } from 'aws-core-vscode/amazonqFeatureDev'
import { sleep } from 'aws-core-vscode/shared'

describe('Amazon Q Feature Dev', function () {
    let framework: qTestingFramework
    let tab: Messenger

    const prompt = 'Add blank.txt file with empty content'
    const codegenApproachPrompt = prompt + ' and add a readme that describes the changes'
    const tooManyRequestsWaitTime = 100000

    function waitForButtons(buttons: FollowUpTypes[]) {
        return tab.waitForEvent(() => {
            return buttons.every((value) => tab.hasButton(value))
        })
    }

    async function waitForText(text: string) {
        await tab.waitForEvent(
            () => {
                return tab.getChatItems().some((chatItem) => chatItem.body === text)
            },
            {
                waitIntervalInMs: 250,
                waitTimeoutInMs: 2000,
            }
        )
    }

    async function iterate(prompt: string) {
        tab.addChatMessage({ prompt })

        await retryIfRequired(
            async () => {
                // Wait for a backend response
                await tab.waitForChatFinishesLoading()
            },
            () => {}
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

    before(async function () {
        /**
         * The tests are getting throttled, only run them on stable for now
         *
         * TODO: Re-enable for all versions once the backend can handle them
         */
        const testVersion = process.env['VSCODE_TEST_VERSION']
        if (testVersion && testVersion !== 'stable') {
            this.skip()
        }

        await using(registerAuthHook('amazonq-test-account'), async () => {
            await loginToIdC()
        })
    })

    beforeEach(() => {
        registerAuthHook('amazonq-test-account')
        framework = new qTestingFramework('featuredev', true)
        tab = framework.createTab()
    })

    afterEach(() => {
        framework.removeTab(tab.tabID)
        framework.dispose()
        sinon.restore()
    })

    describe('Quick action availability', () => {
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
            framework = new qTestingFramework('featuredev', false)
            const tab = framework.createTab()
            const command = tab.findCommand('/dev')
            if (command.length > 0) {
                assert.fail('Found command when it should not have been found')
            }
        })
    })

    describe('/dev entry', () => {
        it('Clicks examples', async () => {
            const q = framework.createTab()
            q.addChatMessage({ command: '/dev' })
            await retryIfRequired(
                async () => {
                    await q.waitForChatFinishesLoading()
                },
                () => {
                    q.clickButton(FollowUpTypes.DevExamples)

                    const lastChatItems = q.getChatItems().pop()
                    assert.deepStrictEqual(lastChatItems?.body, examples)
                }
            )
        })
    })

    describe('/dev {msg} entry', async () => {
        beforeEach(async function () {
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

        it('Clicks accept code and click new task', async () => {
            await retryIfRequired(async () => {
                await Promise.any([
                    waitForButtons([FollowUpTypes.InsertCode, FollowUpTypes.ProvideFeedbackAndRegenerateCode]),
                    waitForButtons([FollowUpTypes.Retry]),
                ])
            })
            tab.clickButton(FollowUpTypes.InsertCode)
            await waitForButtons([FollowUpTypes.NewTask, FollowUpTypes.CloseSession])
            tab.clickButton(FollowUpTypes.NewTask)
            await waitForText('What new task would you like to work on?')
            assert.deepStrictEqual(tab.getChatItems().pop()?.body, 'What new task would you like to work on?')
        })

        it('Iterates on codegen', async () => {
            await retryIfRequired(async () => {
                await Promise.any([
                    waitForButtons([FollowUpTypes.InsertCode, FollowUpTypes.ProvideFeedbackAndRegenerateCode]),
                    waitForButtons([FollowUpTypes.Retry]),
                ])
            })
            tab.clickButton(FollowUpTypes.ProvideFeedbackAndRegenerateCode)
            await tab.waitForChatFinishesLoading()
            await iterate(codegenApproachPrompt)
            tab.clickButton(FollowUpTypes.InsertCode)
            await waitForButtons([FollowUpTypes.NewTask, FollowUpTypes.CloseSession])
        })
    })
})
