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
            await new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(true), 300)
            })
        })

        it ('returns 0 if timer is expired', () => {
            const shortTimer = new timeoutUtils.Timeout(1)
            setTimeout(() => assert.strictEqual(shortTimer.remainingTime, 0), 100)
        })

        it ('returns a Promise if a timer is active', async () => {
            const longTimer = new timeoutUtils.Timeout(300)
            assert.strictEqual(longTimer.timer instanceof Promise, true)
            // bleed the timeout to not mess with other tests
            await new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(true), 300)
            })
        })

        it ('returns false if a timer is expired', async () => {
            const shortTimer = new timeoutUtils.Timeout(1)
            await new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(true), 100)
            })
            assert.strictEqual(await shortTimer.timer, false)
        })

        it ('correctly reports an elapsed time with a 3ms margin of error', async () => {
            const longTimer = new timeoutUtils.Timeout(300)
            setTimeout(() => assert.strictEqual(longTimer.elapsedTime > 97 && longTimer.elapsedTime < 103, true), 100)
            // bleed the timeout to not mess with other tests
            await new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(true), 300)
            })
        })
    })
})
