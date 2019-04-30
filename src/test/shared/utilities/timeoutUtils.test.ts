/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as timeoutUtils from '../../../shared/utilities/timeoutUtils'

describe ('timeoutUtils', async () => {

    describe ('Timeout', async () => {

        it ('returns > 0 if the timer is still active', async () => {
            const longTimer = new timeoutUtils.Timeout(300)
            assert.strictEqual(longTimer.remainingTime > 0, true)
            // bleed the timeout to not mess with other tests
            await longTimer.timer
        })

        it ('returns 0 if timer is expired', async () => {
            const shortTimer = new timeoutUtils.Timeout(1)
            await new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(true), 100)
            })
            assert.strictEqual(shortTimer.remainingTime, 0)
        })

        it ('returns a Promise if a timer is active', async () => {
            const longTimer = new timeoutUtils.Timeout(300)
            assert.strictEqual(longTimer.timer instanceof Promise, true)
            // bleed the timeout to not mess with other tests
            await longTimer.timer
        })

        it ('returns false if a timer is expired', async () => {
            const shortTimer = new timeoutUtils.Timeout(1)
            const result = await shortTimer.timer
            assert.strictEqual(result, false)
        })

        it ('correctly reports an elapsed time with a 3ms margin of error', async () => {
            const longTimer = new timeoutUtils.Timeout(300)
            await new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(true), 100)
            })
            const elapsed = longTimer.elapsedTime
            assert.strictEqual(elapsed > 97 && elapsed < 103, true)
            // bleed the timeout to not mess with other tests
            await longTimer.timer
        })
    })
})
