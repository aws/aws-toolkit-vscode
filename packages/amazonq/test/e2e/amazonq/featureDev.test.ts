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
import { FollowUpTypes } from 'aws-core-vscode/amazonq'
import { sleep } from 'aws-core-vscode/shared'

describe('Amazon Q Feature Dev', function () {
    let framework: qTestingFramework
    let tab: Messenger

    const prompt = 'Add current timestamp into blank.txt'
    const iteratePrompt = `Add a new section in readme to explain your change`
    const fileLevelAcceptPrompt = `${prompt} and ${iteratePrompt}`
    const informationCard =
        'After you provide a task, I will:\n1. Generate code based on your description and the code in your workspace\n2. Provide a list of suggestions for you to review and add to your workspace\n3. If needed, iterate based on your feedback\nTo learn more, visit the [user guide](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/software-dev.html)'
    const tooManyRequestsWaitTime = 100000

    async function waitForText(text: string) {
        await tab.waitForText(text, {
            waitIntervalInMs: 250,
            waitTimeoutInMs: 2000,
        })
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

    async function clickActionButton(filePath: string, actionName: string) {
        tab.clickFileActionButton(filePath, actionName)
        await tab.waitForEvent(() => !tab.hasAction(filePath, actionName), {
            waitIntervalInMs: 500,
            waitTimeoutInMs: 600000,
        })
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
        framework = new qTestingFramework('featuredev', true, [])
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
            framework = new qTestingFramework('featuredev', false, [])
            const tab = framework.createTab()
            const command = tab.findCommand('/dev')
            if (command.length > 0) {
                assert.fail('Found command when it should not have been found')
            }
        })
    })

    describe('/dev entry', () => {
        before(async () => {
            tab = framework.createTab()
            tab.addChatMessage({ command: '/dev' }) // This would create a new tab for feature dev.
            tab = framework.getSelectedTab()
        })

        it('should display information card', async () => {
            await retryIfRequired(
                async () => {
                    await tab.waitForChatFinishesLoading()
                },
                () => {
                    const lastChatItems = tab.getChatItems().pop()
                    assert.deepStrictEqual(lastChatItems?.body, informationCard)
                }
            )
        })
    })

    describe('/dev {msg} entry', async () => {
        beforeEach(async function () {
            const isMultiIterationTestsEnabled = process.env['AMAZONQ_FEATUREDEV_ITERATION_TEST'] // Controls whether to enable multiple iteration testing for Amazon Q feature development
            if (!isMultiIterationTestsEnabled) {
                this.skip()
            } else {
                this.timeout(900000) // Code Gen with multi-iterations requires longer than default timeout(5 mins).
            }
            tab = framework.createTab()
            tab.addChatMessage({ command: '/dev', prompt })
            tab = framework.getSelectedTab()
            await retryIfRequired(
                async () => {
                    await tab.waitForChatFinishesLoading()
                },
                () => {}
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
                    tab.waitForButtons([FollowUpTypes.InsertCode, FollowUpTypes.ProvideFeedbackAndRegenerateCode]),
                    tab.waitForButtons([FollowUpTypes.Retry]),
                ])
            })
            tab.clickButton(FollowUpTypes.InsertCode)
            await tab.waitForButtons([FollowUpTypes.NewTask, FollowUpTypes.CloseSession])
            tab.clickButton(FollowUpTypes.NewTask)
            await waitForText('What new task would you like to work on?')
            assert.deepStrictEqual(tab.getChatItems().pop()?.body, 'What new task would you like to work on?')
        })

        it('Iterates on codegen', async () => {
            await retryIfRequired(async () => {
                await Promise.any([
                    tab.waitForButtons([FollowUpTypes.InsertCode, FollowUpTypes.ProvideFeedbackAndRegenerateCode]),
                    tab.waitForButtons([FollowUpTypes.Retry]),
                ])
            })
            tab.clickButton(FollowUpTypes.ProvideFeedbackAndRegenerateCode)
            await tab.waitForChatFinishesLoading()
            await iterate(iteratePrompt)
            tab.clickButton(FollowUpTypes.InsertCode)
            await tab.waitForButtons([FollowUpTypes.NewTask, FollowUpTypes.CloseSession])
        })
    })

    describe('file-level accepts', async () => {
        beforeEach(async function () {
            tab = framework.createTab()
            tab.addChatMessage({ command: '/dev', prompt: fileLevelAcceptPrompt })
            tab = framework.getSelectedTab()
            await retryIfRequired(
                async () => {
                    await tab.waitForChatFinishesLoading()
                },
                () => {
                    tab.addChatMessage({ prompt })
                }
            )
            await retryIfRequired(async () => {
                await Promise.any([
                    tab.waitForButtons([FollowUpTypes.InsertCode, FollowUpTypes.ProvideFeedbackAndRegenerateCode]),
                    tab.waitForButtons([FollowUpTypes.Retry]),
                ])
            })
        })

        describe('fileList', async () => {
            it('has both accept-change and reject-change action buttons for file', async () => {
                const filePath = tab.getFilePaths()[0]
                assert.ok(tab.getActionsByFilePath(filePath).length === 2)
                assert.ok(tab.hasAction(filePath, 'accept-change'))
                assert.ok(tab.hasAction(filePath, 'reject-change'))
            })

            it('has only revert-rejection action button for rejected file', async () => {
                const filePath = tab.getFilePaths()[0]
                await clickActionButton(filePath, 'reject-change')

                assert.ok(tab.getActionsByFilePath(filePath).length === 1)
                assert.ok(tab.hasAction(filePath, 'revert-rejection'))
            })

            it('does not have any of the action buttons for accepted file', async () => {
                const filePath = tab.getFilePaths()[0]
                await clickActionButton(filePath, 'accept-change')

                assert.ok(tab.getActionsByFilePath(filePath).length === 0)
            })

            it('disables all action buttons when new task is clicked', async () => {
                tab.clickButton(FollowUpTypes.InsertCode)
                await tab.waitForButtons([FollowUpTypes.NewTask, FollowUpTypes.CloseSession])
                tab.clickButton(FollowUpTypes.NewTask)
                await waitForText('What new task would you like to work on?')

                const filePaths = tab.getFilePaths()
                for (const filePath of filePaths) {
                    assert.ok(tab.getActionsByFilePath(filePath).length === 0)
                }
            })

            it('disables all action buttons when close session is clicked', async () => {
                tab.clickButton(FollowUpTypes.InsertCode)
                await tab.waitForButtons([FollowUpTypes.NewTask, FollowUpTypes.CloseSession])
                tab.clickButton(FollowUpTypes.CloseSession)
                await waitForText(
                    "Okay, I've ended this chat session. You can open a new tab to chat or start another workflow."
                )

                const filePaths = tab.getFilePaths()
                for (const filePath of filePaths) {
                    assert.ok(tab.getActionsByFilePath(filePath).length === 0)
                }
            })
        })

        describe('accept button', async () => {
            describe('button text', async () => {
                it('shows "Accept all changes" when no files are accepted or rejected, and "Accept remaining changes" otherwise', async () => {
                    let insertCodeButton = tab.getFollowUpButton(FollowUpTypes.InsertCode)
                    assert.ok(insertCodeButton.pillText === 'Accept all changes')

                    const filePath = tab.getFilePaths()[0]
                    await clickActionButton(filePath, 'reject-change')

                    insertCodeButton = tab.getFollowUpButton(FollowUpTypes.InsertCode)
                    assert.ok(insertCodeButton.pillText === 'Accept remaining changes')

                    await clickActionButton(filePath, 'revert-rejection')

                    insertCodeButton = tab.getFollowUpButton(FollowUpTypes.InsertCode)
                    assert.ok(insertCodeButton.pillText === 'Accept all changes')

                    await clickActionButton(filePath, 'accept-change')

                    insertCodeButton = tab.getFollowUpButton(FollowUpTypes.InsertCode)
                    assert.ok(insertCodeButton.pillText === 'Accept remaining changes')
                })

                it('shows "Continue" when all files are either accepted or rejected, with at least one of them rejected', async () => {
                    const filePaths = tab.getFilePaths()
                    for (const filePath of filePaths) {
                        await clickActionButton(filePath, 'reject-change')
                    }

                    const insertCodeButton = tab.getFollowUpButton(FollowUpTypes.InsertCode)
                    assert.ok(insertCodeButton.pillText === 'Continue')
                })
            })

            it('disappears and automatically moves on to the next step when all changes are accepted', async () => {
                const filePaths = tab.getFilePaths()
                for (const filePath of filePaths) {
                    await clickActionButton(filePath, 'accept-change')
                }
                await tab.waitForButtons([FollowUpTypes.NewTask, FollowUpTypes.CloseSession])

                assert.ok(tab.hasButton(FollowUpTypes.InsertCode) === false)
                assert.ok(tab.hasButton(FollowUpTypes.ProvideFeedbackAndRegenerateCode) === false)
            })
        })
    })
})
