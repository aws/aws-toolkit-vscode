/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { InactivityMessage, shouldTrackUserActivity } from '../../codecatalyst/devEnv'
import * as sinon from 'sinon'
import { sleep } from '../../shared/utilities/timeoutUtils'
import { TestWindow, getTestWindow } from '../../test/shared/vscode/window'
import { DevEnvActivity } from '../../shared/clients/devenvClient'

describe('shouldTrackUserActivity', function () {
    it('returns true when inactivity timeout > 0', function () {
        assert.strictEqual(shouldTrackUserActivity(1), true)
        assert.strictEqual(shouldTrackUserActivity(15), true)
    })

    it('returns false when inactivity timeout <== 0', function () {
        assert.strictEqual(shouldTrackUserActivity(0), false)
        assert.strictEqual(shouldTrackUserActivity(-1), false)
    })
})

describe('InactivityMessages', function () {
    /** Actual minute in prod is this value instead so testing is faster. */
    let relativeMinuteMillis: number
    let testWindow: TestWindow
    let devEnvActivity: sinon.SinonStubbedInstance<DevEnvActivity>
    let actualMessages: { message: string; minute: number }[] = []
    let instance: InactivityMessage

    beforeEach(function () {
        relativeMinuteMillis = 200
        testWindow = getTestWindow()
        instance = new InactivityMessage()

        devEnvActivity = sinon.createStubInstance(DevEnvActivity)
        // Setup for DevEnvClient stub to call the onUserActivity event callback code when updateUserActivity() is called
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
        instance.dispose()
        testWindow.dispose()
    })

    it('shows expected messages 5 minutes before shutdown on a 15 minute inactivity timeout', async function () {
        await instance.setupMessage(15, devEnvActivity as unknown as DevEnvActivity, relativeMinuteMillis)

        await assertMessagesShown([
            ['Your CodeCatalyst Dev Environment has been inactive for 10 minutes, shutting it down in 5 minutes.', 10],
            ['Your CodeCatalyst Dev Environment has been inactive for 11 minutes, shutting it down in 4 minutes.', 11],
            ['Your CodeCatalyst Dev Environment has been inactive for 12 minutes, shutting it down in 3 minutes.', 12],
            ['Your CodeCatalyst Dev Environment has been inactive for 13 minutes, shutting it down in 2 minutes.', 13],
            ['Your CodeCatalyst Dev Environment has been inactive for 14 minutes, and will stop soon.', 14],
        ])
    })

    it('shows expected messages 5 minutes before shutdown on a 60 minute inactivity timeout', async function () {
        await instance.setupMessage(60, devEnvActivity as unknown as DevEnvActivity, relativeMinuteMillis)

        await assertMessagesShown([
            ['Your CodeCatalyst Dev Environment has been inactive for 55 minutes, shutting it down in 5 minutes.', 55],
            ['Your CodeCatalyst Dev Environment has been inactive for 56 minutes, shutting it down in 4 minutes.', 56],
            ['Your CodeCatalyst Dev Environment has been inactive for 57 minutes, shutting it down in 3 minutes.', 57],
            ['Your CodeCatalyst Dev Environment has been inactive for 58 minutes, shutting it down in 2 minutes.', 58],
            ['Your CodeCatalyst Dev Environment has been inactive for 59 minutes, and will stop soon.', 59],
        ])
    })

    it('resets the inactivity countdown when a user clicks on a button in any activity message', async function () {
        let isFirstMessage = true
        testWindow.onDidShowMessage(async message => {
            if (message.message.endsWith('stop soon.')) {
                // User hits the 'I'm here!' button on the inactivity shutdown message
                message.selectItem(`I'm here!`)
                return
            }

            if (!isFirstMessage) {
                return
            }
            isFirstMessage = false
            // User hits the 'Cancel' button on the first inactivity warning message
            message.selectItem('Cancel')
        })

        await instance.setupMessage(7, devEnvActivity as unknown as DevEnvActivity, relativeMinuteMillis)

        await assertMessagesShown([
            ['Your CodeCatalyst Dev Environment has been inactive for 2 minutes, shutting it down in 5 minutes.', 2],
            // User clicked 'Cancel' on the warning message so timer was reset
            ['Your CodeCatalyst Dev Environment has been inactive for 2 minutes, shutting it down in 5 minutes.', 4],
            ['Your CodeCatalyst Dev Environment has been inactive for 3 minutes, shutting it down in 4 minutes.', 5],
            ['Your CodeCatalyst Dev Environment has been inactive for 4 minutes, shutting it down in 3 minutes.', 6],
            ['Your CodeCatalyst Dev Environment has been inactive for 5 minutes, shutting it down in 2 minutes.', 7],
            ['Your CodeCatalyst Dev Environment has been inactive for 6 minutes, and will stop soon.', 8],
            // User clicked "I'm here!" on the shutdown message so timer was reset
            ['Your CodeCatalyst Dev Environment has been inactive for 2 minutes, shutting it down in 5 minutes.', 10],
        ])
    })

    it('takes in to consideration 2 1/2 minutes have already passed for an inactive external client.', async function () {
        const inactiveMinutes = 9
        const initialOffsetMinutes = 2.5
        // We normally show the warning message after 6 inactive minutes of user percieved time
        // in this scenario (9 inactive minutes till shutdown).
        //
        // But because we are taking in to consideration 2 1/2 minutes have already passed, we show the warning
        // 3 minutes before it typically would.
        // Remember that minutesElapsedSinceLatestTimestamp() sleeps till the next whole minute,
        // which is why 2 1/2 minutes becomes 3 minutes. Then we start the countdown to show the
        // first warning message.
        const minuteFirstMessageShown =
            inactiveMinutes - Math.ceil(initialOffsetMinutes) - InactivityMessage.firstMessageBeforeShutdown
        setInitialOffset(initialOffsetMinutes)

        await instance.setupMessage(inactiveMinutes, devEnvActivity as unknown as DevEnvActivity, relativeMinuteMillis)

        await assertMessagesShown([
            [
                'Your CodeCatalyst Dev Environment has been inactive for 4 minutes, shutting it down in 5 minutes.',
                minuteFirstMessageShown,
            ],
            [
                'Your CodeCatalyst Dev Environment has been inactive for 5 minutes, shutting it down in 4 minutes.',
                minuteFirstMessageShown + 1,
            ],
            [
                'Your CodeCatalyst Dev Environment has been inactive for 6 minutes, shutting it down in 3 minutes.',
                minuteFirstMessageShown + 2,
            ],
            [
                'Your CodeCatalyst Dev Environment has been inactive for 7 minutes, shutting it down in 2 minutes.',
                minuteFirstMessageShown + 3,
            ],
            [
                'Your CodeCatalyst Dev Environment has been inactive for 8 minutes, and will stop soon.',
                minuteFirstMessageShown + 4,
            ],
        ])
    })

    it('does not show any inactivity message if a newer user activity is found using the api', async function () {
        // This gets checked each time before we decide to show the message.
        // If a new user activity exists then we abort showing the message.
        devEnvActivity.isLocalActivityStale.callsFake(async () => {
            return true
        })

        await instance.setupMessage(
            InactivityMessage.firstMessageBeforeShutdown + 1,
            devEnvActivity as unknown as DevEnvActivity,
            relativeMinuteMillis
        )
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
        // Sleep until all messages should have been shown.
        //
        // This buffer gives us a bit more time to wrap things up.
        // Be careful setting it to >relativeMinuteMillis, as it could
        // start a new cycle of messages if too large.
        const expectedMinuteLastMessageShown = expectedMessages[expectedMessages.length - 1][1]
        const buffer = relativeMinuteMillis - 1
        await sleep(expectedMinuteLastMessageShown * relativeMinuteMillis + buffer)

        if (expectedMessages.length !== actualMessages.length) {
            assert.fail(`Expected ${expectedMessages.length} messages, but got ${actualMessages.length}`)
        }

        let i: number
        for (i = 0; i < expectedMessages.length; i++) {
            assert.strictEqual(actualMessages[i].message, expectedMessages[i][0])
            assert.strictEqual(actualMessages[i].minute, expectedMessages[i][1])
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

    let _initialOffset: number | undefined
    /**
     * This is used for the edge case where the MDE was previously updated with an activity
     * timestamp, but once our client retrieves this value some time has already passed.
     */
    function setInitialOffset(minutes: number) {
        _initialOffset = minutes * relativeMinuteMillis
    }

    function getLatestTimestamp() {
        let timestamp = Date.now()
        if (_initialOffset) {
            timestamp -= _initialOffset
            _initialOffset = undefined
        }

        return timestamp
    }
})
