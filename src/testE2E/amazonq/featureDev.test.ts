/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { qTestingFramework } from './framework/framework'
import { FollowUpTypes } from '../../amazonqFeatureDev/types'
import sinon from 'sinon'
import { FeatureDevClient } from '../../amazonqFeatureDev/client/featureDev'
import { verifyTextOrder } from './framework/text'
import { examples } from '../../amazonqFeatureDev/userFacingText'
import * as authUtil from '../../codewhisperer/util/authUtil'
import request from '../../common/request'

describe('Amazon Q Feature Dev', function () {
    let framework: qTestingFramework

    const samplePlanResponse = 'sample plan response'

    beforeEach(() => {
        /**
         * TODO remove these stubs when we know the backend can handle all the test load + when we know the tests
         * are working without any flakiness
         */
        sinon.stub(authUtil, 'getChatAuthState').resolves({
            amazonQ: 'connected',
            codewhispererChat: 'connected',
            codewhispererCore: 'connected',
        })
        sinon.stub(FeatureDevClient.prototype, 'createConversation').resolves('1234')
        sinon.stub(FeatureDevClient.prototype, 'createUploadUrl').resolves({
            uploadId: '5678',
            uploadUrl: 'foo',
            $response: sinon.mock() as any,
        })
        sinon.stub(FeatureDevClient.prototype, 'generatePlan').resolves(samplePlanResponse)
        sinon.stub(request, 'fetch').resolves({
            response: {
                status: 200,
            },
        })
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

            // Verify that all the responses come back in the correct order
            verifyTextOrder(chatItems, ['Welcome to /dev', prompt, samplePlanResponse])

            // Check that the last UI message has the two buttons
            assert.notStrictEqual(chatItems.pop()?.followUp?.options, [
                {
                    type: FollowUpTypes.NewTask,
                },
                {
                    type: FollowUpTypes.WriteCode,
                    disabled: false,
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

            // Verify that all the responses come back in the correct order
            verifyTextOrder(chatItems, [prompt, samplePlanResponse])

            // Check that the UI has the two buttons
            assert.notStrictEqual(chatItems.pop()?.followUp?.options, [
                {
                    type: FollowUpTypes.NewTask,
                },
                {
                    type: FollowUpTypes.WriteCode,
                    disabled: false,
                },
            ])
        })
    })
})
