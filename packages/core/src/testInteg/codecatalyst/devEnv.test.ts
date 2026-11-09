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

describe('InactivityMessage', function () {
    /** Actual minute in prod is this value instead so testing is faster. */
    let relativeMinuteMillis: number
    let testWindow: TestWindow
    let devEnvActivity: sinon.SinonStubbedInstance<DevEnvActivity>
    let actualMessages: { message: string; minute: number }[] = []
    let inactivityMsg: InactivityMessage
    let userActivity: number

    beforeEach(function () {
        relativeMinuteMillis = 100
        testWindow = getTestWindow()
        inactivityMsg = new InactivityMessage()
        userActivity = 0
        setInitialOffset(0)

        devEnvActivity = sinon.createStubInstance(DevEnvActivity)
        devEnvActivity.sendActivityUpdate.callsFake(async () => {
            userActivity += 1
            const timestamp = getLatestTimestamp()
            return timestamp
        })
        devEnvActivity.onActivityUpdate.callsFake((activityCallback) => {
            const timestamp = getLatestTimestamp()
            activityCallback(timestamp)
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

    it('shows warning 5 minutes before shutdown for 15 minute timeout', async function () {
        setInitialOffset(9)
        await inactivityMsg.init(15, devEnvActivity as unknown as DevEnvActivity, relativeMinuteMillis)

        await assertMessagesShown([
            ['Your CodeCatalyst Dev Environment has been inactive for 10 minutes, and will stop soon.', 10],
        ])
    })

    it('shows warning 5 minutes before shutdown for 60 minute timeout', async function () {
        setInitialOffset(54)
        await inactivityMsg.init(60, devEnvActivity as unknown as DevEnvActivity, relativeMinuteMillis)

        await assertMessagesShown([
            ['Your CodeCatalyst Dev Environment has been inactive for 55 minutes, and will stop soon.', 55],
        ])
    })

    it.skip('resets inactivity countdown when a user confirms the message', async function () {
        await inactivityMsg.init(10, devEnvActivity as unknown as DevEnvActivity, relativeMinuteMillis)
        const msg = await testWindow.waitForMessage(/Dev Environment has been inactive/)
        assert.deepStrictEqual(userActivity, 1)
        msg.selectItem("I'm here!")
        await waitUntil(async () => userActivity > 1, { truthy: true, interval: 100, timeout: 5_000 })
        assert.deepStrictEqual(userActivity, 2, 'confirming the message should trigger user activity')

        await assertMessagesShown([
            ['Your CodeCatalyst Dev Environment has been inactive for 5 minutes, and will stop soon.', 5],
        ])
    })

    it('offsets when 2.5 minutes have already passed for an inactive external client', async function () {
        setInitialOffset(2.5)
        await inactivityMsg.init(9, devEnvActivity as unknown as DevEnvActivity, relativeMinuteMillis)

        await assertMessagesShown([
            ['Your CodeCatalyst Dev Environment has been inactive for 4 minutes, and will stop soon.', 4],
        ])
    })

    it('does not show inactivity message if user activity is found using the API', async function () {
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
            assert.deepStrictEqual(actualMessages[i].message, expected.message)
            // Avoid flakiness in the timing by looking within a minute rather than exact.
            assert.ok(
                Math.abs(actualMessages[i].minute - expected.minute) <= 1,
                `Expected to be within 60 seconds of minute ${expected.minute}, but instead was at minute ${actualMessages[i].minute}`
            )
        }
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

        return timestamp
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
        testWindow.onDidShowMessage(async (message) => {
            const now = Date.now()
            messages.push({
                message: message.message,
                minute: Math.floor((now + _initialOffset - start) / relativeMinuteMillis),
            })
        })
        actualMessages = messages
    }
})
