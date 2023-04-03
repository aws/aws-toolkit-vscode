/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { once, throttle } from '../../../shared/utilities/functionUtils'
import { installFakeClock } from '../../testUtil'

describe('once', function () {
    it('does not execute sync functions returning void more than once', function () {
        let counter = 0
        const fn = once(() => void counter++)

        fn()
        assert.strictEqual(counter, 1)

        fn()
        assert.strictEqual(counter, 1)
    })
})

describe('throttle', function () {
    let counter: number
    let fn: () => Promise<unknown>

    beforeEach(function () {
        counter = 0
        fn = throttle(() => void counter++)
    })

    it('prevents a function from executing more than once in the `delay` window', async function () {
        await Promise.all([fn(), fn()])
        assert.strictEqual(counter, 1)
    })

    it('returns references to the promises', async function () {
        const invokes = [fn(), fn()]
        assert.strictEqual(invokes[0], invokes[1])
        await Promise.all(invokes)
    })

    it('allows the function to be called again after resolving', async function () {
        await Promise.all([fn(), fn()])
        await Promise.all([fn(), fn(), fn()])
        assert.strictEqual(counter, 2)
    })

    it('rolls the delay window when called', async function () {
        fn = fn = throttle(() => void counter++, 10)
        const clock = installFakeClock()
        const calls: ReturnType<typeof fn>[] = []
        const callAndSleep = async (delayInMs: number) => {
            calls.push(fn())
            await clock.tickAsync(delayInMs)
        }

        await callAndSleep(5) // timeout set at T+10ms
        await callAndSleep(5) // timeout moved to T+15ms
        await callAndSleep(10) // timeout moved to T+20ms
        await callAndSleep(10) // timeout expired, start new one at T+30ms

        // finish at T+40ms
        await Promise.all(calls)
        assert.strictEqual(counter, 2)
        assert.strictEqual(calls.length, 4)
    })
})
