/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { InactivityMessage, shouldSendActivity } from '../../codecatalyst/devEnv'
import * as sinon from 'sinon'
import { sleep, waitUntil } from '../../shared/utilities/timeoutUtils'
import { TestWindow, getTestWindow } from '../../test/shared/vscode/window'
import { DevEnvActivity } from '../../shared/clients/devenvClient'

describe('shouldSendActivity', function () {
    it('returns true when inactivity timeout > 0', function () {
        assert.strictEqual(shouldSendActivity(1), true)
        assert.strictEqual(shouldSendActivity(15), true)
    })

    it('returns false when inactivity timeout <== 0', function () {
        assert.strictEqual(shouldSendActivity(0), false)
        assert.strictEqual(shouldSendActivity(-1), false)
    })
})

describe('InactivityMessages', function () {
    /** Actual minute in prod is this value instead so testing is faster. */
    let relativeMinuteMillis: number
    let testWindow: TestWindow
    let devEnvActivity: sinon.SinonStubbedInstance<DevEnvActivity>
    let actualMessages: { message: string; minute: number }[] = []
    let inactivityMsg: InactivityMessage

    beforeEach(function () {
        relativeMinuteMillis = 200
        testWindow = getTestWindow()
        inactivityMsg = new InactivityMessage()

        devEnvActivity = sinon.createStubInstance(DevEnvActivity)
        // Setup for DevEnvClient stub to call the onUserActivity event callback code when sendActivityUpdate() is called
        devEnvActivity.onActivityUpdate.callsFake(activityCallback => {
            devEnvActivity.sendActivityUpdate.callsFake(async () => {
                const timestamp = getLatestTimestamp()
                activityCallback(timestamp)
                return timestamp
            })
        })
        devEnvActivity.isLocalActivityStale.callsFake(async () => {
            return false
        })

        startCapturingMessages()
    })

    afterEach(function () {
        inactivityMsg.dispose()
        testWindow.dispose()
    })

    it('shows expected messages 5 minutes before shutdown on a 15 minute inactivity timeout', async function () {
        await inactivityMsg.init(15, devEnvActivity as unknown as DevEnvActivity, relativeMinuteMillis)
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()

        await assertMessagesShown([
            ['Your CodeCatalyst Dev Environment has been inactive for 10 minutes, and will stop in 5 minutes.', 10],
            ['Your CodeCatalyst Dev Environment has been inactive for 11 minutes, and will stop in 4 minutes.', 11],
            ['Your CodeCatalyst Dev Environment has been inactive for 12 minutes, and will stop in 3 minutes.', 12],
            ['Your CodeCatalyst Dev Environment has been inactive for 13 minutes, and will stop in 2 minutes.', 13],
            ['Your CodeCatalyst Dev Environment has been inactive for 14 minutes, and will stop soon.', 14],
        ])
    })

    it('shows expected messages 5 minutes before shutdown on a 60 minute inactivity timeout', async function () {
        await inactivityMsg.init(60, devEnvActivity as unknown as DevEnvActivity, relativeMinuteMillis)
        setInitialOffset(57)
        await devEnvActivity.sendActivityUpdate()
        await waitUntil(async () => actualMessages.length > 0, { interval: 10 })
        setInitialOffset(58)
        await devEnvActivity.sendActivityUpdate()
        await waitUntil(async () => actualMessages.length > 2, { interval: 10 })

        await assertMessagesShown([
            ['Your CodeCatalyst Dev Environment has been inactive for 57 minutes, and will stop in 3 minutes.', 0],
            ['Your CodeCatalyst Dev Environment has been inactive for 58 minutes, and will stop in 2 minutes.', 0],
            ['Your CodeCatalyst Dev Environment has been inactive for 59 minutes, and will stop soon.', 1],
        ])
    })

    it('resets the inactivity countdown when a user clicks on a button in any activity message', async function () {
        let isFirstMessage = true
        testWindow.onDidShowMessage(async message => {
            if (message.message.endsWith('stop soon.')) {
                // User hits the "I'm here!" button on the inactivity shutdown message
                message.selectItem("I'm here!")
                return
            }

            if (!isFirstMessage) {
                return
            }
            isFirstMessage = false
            // User hits the 'Cancel' button on the first inactivity warning message
            message.selectItem('Cancel')
        })

        await inactivityMsg.init(7, devEnvActivity as unknown as DevEnvActivity, relativeMinuteMillis)
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()

        await assertMessagesShown([
            ['Your CodeCatalyst Dev Environment has been inactive for 2 minutes, and will stop in 5 minutes.', 2],
            // User clicked 'Cancel' on the warning message so timer was reset
            ['Your CodeCatalyst Dev Environment has been inactive for 2 minutes, and will stop in 5 minutes.', 4],
            ['Your CodeCatalyst Dev Environment has been inactive for 3 minutes, and will stop in 4 minutes.', 5],
            ['Your CodeCatalyst Dev Environment has been inactive for 4 minutes, and will stop in 3 minutes.', 6],
            ['Your CodeCatalyst Dev Environment has been inactive for 5 minutes, and will stop in 2 minutes.', 7],
            ['Your CodeCatalyst Dev Environment has been inactive for 6 minutes, and will stop soon.', 8],
            // User clicked "I'm here!" on the shutdown message so timer was reset
            ['Your CodeCatalyst Dev Environment has been inactive for 2 minutes, and will stop in 5 minutes.', 10],
        ])
    })

    it('takes in to consideration 2 1/2 minutes have already passed for an inactive external client.', async function () {
        setInitialOffset(2.5)
        await inactivityMsg.init(9, devEnvActivity as unknown as DevEnvActivity, relativeMinuteMillis)
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()
        await devEnvActivity.sendActivityUpdate()

        await assertMessagesShown([
            ['Your CodeCatalyst Dev Environment has been inactive for 4 minutes, and will stop in 5 minutes.', 4],
            ['Your CodeCatalyst Dev Environment has been inactive for 5 minutes, and will stop in 4 minutes.', 5],
            ['Your CodeCatalyst Dev Environment has been inactive for 6 minutes, and will stop in 3 minutes.', 6],
            ['Your CodeCatalyst Dev Environment has been inactive for 7 minutes, and will stop in 2 minutes.', 7],
            ['Your CodeCatalyst Dev Environment has been inactive for 8 minutes, and will stop soon.', 8],
        ])
    })

    it('does not show any inactivity message if a newer user activity is found using the api', async function () {
        // This gets checked each time before we decide to show the message.
        // If a new user activity exists then we abort showing the message.
        devEnvActivity.isLocalActivityStale.callsFake(async () => {
            return true
        })

        await inactivityMsg.init(
            inactivityMsg.shutdownWarningThreshold + 1,
            devEnvActivity as unknown as DevEnvActivity,
            relativeMinuteMillis
        )
        await devEnvActivity.sendActivityUpdate()
        await sleep(relativeMinuteMillis * 3)
        assert.strictEqual(testWindow.shownMessages.length, 0)
        assert.strictEqual(devEnvActivity.isLocalActivityStale.calledOnce, true)
    })

    /**
     * Assert the expected inactivity message was shown at the
     * right time.
     *
     * @param text The actual message itself
     * @param minute The minute the message was expected to be shown at
     */
    async function assertMessagesShown(expectedMessages: [text: string, minute: number][]) {
        await waitUntil(
            async () => {
                return expectedMessages.length === actualMessages.length
            },
            { truthy: true, interval: 200, timeout: 10_000 }
        )
        if (expectedMessages.length !== actualMessages.length) {
            assert.fail(`Expected ${expectedMessages.length} messages, but got ${actualMessages.length}`)
        }

        for (let i = 0; i < expectedMessages.length; i++) {
            const expected = {
                message: expectedMessages[i][0],
                minute: expectedMessages[i][1],
            }
            assert.deepStrictEqual(actualMessages[i], expected)
        }
    }

    /**
     * Starts capturing all vscode messages shown and records them in {@link actualMessages}.
     *
     * The `minute` field in {@link actualMessages} records the minute the message was shown.
     * This value is relative to {@link relativeMinuteMillis}.
     */
    function startCapturingMessages() {
        const start = Date.now()
        const messages: { message: string; minute: number }[] = []
        testWindow.onDidShowMessage(async message => {
            const now = Date.now()
            messages.push({ message: message.message, minute: Math.floor((now - start) / relativeMinuteMillis) })
        })
        actualMessages = messages
    }

    let _initialOffset = 0
    /**
     * This is used for the edge case where the MDE was previously updated with an activity
     * timestamp, but once our client retrieves this value some time has already passed.
     */
    function setInitialOffset(minutes: number) {
        _initialOffset = minutes * relativeMinuteMillis
    }

    function getLatestTimestamp() {
        let timestamp = Date.now()
        timestamp -= _initialOffset
        _initialOffset = 0

        return timestamp
    }
})
