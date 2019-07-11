/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as timeoutUtils from '../../../shared/utilities/timeoutUtils'

describe ('timeoutUtils', async () => {

    describe ('Timeout', async () => {

        it ('returns > 0 if the timer is still active', async () => {
            const longTimer = new timeoutUtils.Timeout(300)
            assert.strictEqual(longTimer.remainingTime > 0, true)
            // kill the timer to not mess with other tests
            longTimer.killTimer()
        })

        it ('returns 0 if timer is expired', async () => {
            const shortTimer = new timeoutUtils.Timeout(1)
            setTimeout(() => {assert.strictEqual(shortTimer.remainingTime, 0)}, 10)
        })

        it ('returns a Promise if a timer is active', async () => {
            const longTimer = new timeoutUtils.Timeout(300)
            assert.strictEqual(longTimer.timer instanceof Promise, true)
            // kill the timer to not mess with other tests
            longTimer.killTimer()
        })

        it ('timer object rejects if a timer is expired', async () => {
            const shortTimer = new timeoutUtils.Timeout(1)
            await shortTimer.timer.catch((value) => {
                assert.strictEqual(value, undefined)
            })
        })

        it ('successfully kills active timers', async () => {
            const longTimer = new timeoutUtils.Timeout(300)
            // make sure this is an active Promise
            assert.strictEqual(longTimer.timer instanceof Promise, true)
            longTimer.killTimer()
            try {
                // make sure the promise was resolved
                await longTimer.timer
            } catch {
                // if the timer was not killed, promise will reject after 300 ms and test should fail.
                assert.fail('the promise was not killed!')
            }
        })

        const marginOfError = 10
        const checkTimerMs = 50
        it (`correctly reports an elapsed time with a ${marginOfError}ms margin of error`, async () => {
            const longTimer = new timeoutUtils.Timeout(300)
            await new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(true), checkTimerMs)
            })
            const elapsed = longTimer.elapsedTime
            assert.strictEqual(elapsed > checkTimerMs - marginOfError && elapsed < checkTimerMs + marginOfError, true)
            // kill the timer to not mess with other tests
            longTimer.killTimer()
        })
    })
})
