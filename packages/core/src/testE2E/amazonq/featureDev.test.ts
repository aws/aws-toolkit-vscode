/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { qTestingFramework } from './framework/framework'
import { FollowUpTypes } from '../../amazonqFeatureDev/types'
import sinon from 'sinon'
import { verifyTextOrder } from './framework/text'
import { examples } from '../../amazonqFeatureDev/userFacingText'
import { registerAuthHook, using } from '../../test/setupUtil'
import { loginToIdC } from './utils/setup'

describe.skip('Amazon Q Feature Dev', function () {
    let framework: qTestingFramework

    before(async function () {
        await using(registerAuthHook('amazonq-test-account'), async () => {
            await loginToIdC()
        })
    })

    beforeEach(() => {
        registerAuthHook('amazonq-test-account')
        framework = new qTestingFramework('featuredev', true, true)
    })

    afterEach(() => {
        framework.dispose()
        sinon.restore()
    })

    describe('quick action availability', () => {
        it('Shows /dev when feature dev is enabled', () => {
            const q = framework.createTab()
            const command = q.findCommand('/dev')
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
            const q = framework.createTab()
            const command = q.findCommand('/dev')
            if (command.length > 0) {
                assert.fail('Found command when it should not have been found')
            }
        })
    })

    describe('/dev {msg} entry', async () => {
        it('Receives chat response', async () => {
            this.timeout(60000)
            const q = framework.createTab()
            const prompt = 'Implement twosum in typescript'
            q.addChatMessage({ command: '/dev', prompt })

            // Wait for a backend response
            await q.waitForChatFinishesLoading()

            const chatItems = q.getChatItems()

            /**
             * Verify that all the responses come back in the correct order and that a response
             * after the prompt is non empty (represents a response from the backend, since the same response isn't
             * guarenteed we can't verify direct responses)
             */
            verifyTextOrder(chatItems, [/Welcome to \/dev/, new RegExp(prompt), /.\S/])

            // Check that the last UI message has the two buttons
            assert.notStrictEqual(chatItems.pop()?.followUp?.options, [
                {
                    type: FollowUpTypes.NewPlan,
                },
                {
                    type: FollowUpTypes.GenerateCode,
                    disabled: true,
                },
            ])
        })
    })

    describe('/dev entry', () => {
        it('Clicks examples', async () => {
            const q = framework.createTab()
            q.addChatMessage({ command: '/dev' })
            q.clickButton(FollowUpTypes.DevExamples)

            const lastChatItems = q.getChatItems().pop()
            assert.deepStrictEqual(lastChatItems?.body, examples)
        })

        it('Receives chat response', async () => {
            this.timeout(60000)
            const q = framework.createTab()
            const prompt = 'Implement twosum in typescript'
            q.addChatMessage({ command: '/dev' })
            q.addChatMessage({ prompt })

            // Wait for a backend response
            await q.waitForChatFinishesLoading()

            const chatItems = q.getChatItems()

            /**
             * Verify that all the responses come back in the correct order and that a response
             * after the prompt is non empty (represents a response from the backend, since the same response isn't
             * guarenteed we can't verify direct responses)
             */
            verifyTextOrder(chatItems, [/Welcome to \/dev/, new RegExp(prompt), /.\S/])

            // Check that the UI has the two buttons
            assert.notStrictEqual(chatItems.pop()?.followUp?.options, [
                {
                    type: FollowUpTypes.NewPlan,
                },
                {
                    type: FollowUpTypes.GenerateCode,
                    disabled: true,
                },
            ])
        })
    })
})
