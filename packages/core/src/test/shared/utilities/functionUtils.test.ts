/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { once, onceChanged, debounce } from '../../../shared/utilities/functionUtils'
import { installFakeClock } from '../../testUtil'

describe('functionUtils', function () {
    it('once()', function () {
        let counter = 0
        const fn = once(() => void counter++)

        fn()
        assert.strictEqual(counter, 1)

        fn()
        assert.strictEqual(counter, 1)
    })

    it('onceChanged()', function () {
        let counter = 0
        const arg2 = {}
        const arg2_ = { a: 42 }
        const fn = onceChanged((s: string, o: object) => void counter++)

        fn('arg1', arg2)
        assert.strictEqual(counter, 1)

        fn('arg1', arg2)
        fn('arg1', arg2)
        assert.strictEqual(counter, 1)

        fn('arg1_', arg2)
        assert.strictEqual(counter, 2)

        fn('arg1_', arg2)
        fn('arg1_', arg2)
        fn('arg1_', arg2)
        assert.strictEqual(counter, 2)

        fn('arg1', arg2_)
        assert.strictEqual(counter, 3)

        // TODO: bug/limitation: Objects are not discriminated.
        // TODO: use lib?: https://github.com/anywhichway/nano-memoize
        fn('arg1', arg2_)
        assert.strictEqual(counter, 3)
    })
})

describe('debounce', function () {
    let counter: number
    let fn: () => Promise<unknown>

    beforeEach(function () {
        counter = 0
        fn = debounce(() => void counter++)
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

    describe('window rolling', function () {
        let clock: ReturnType<typeof installFakeClock>
        const calls: ReturnType<typeof fn>[] = []
        const callAndSleep = async (delayInMs: number) => {
            calls.push(fn())
            await clock.tickAsync(delayInMs)
        }

        beforeEach(function () {
            clock = installFakeClock()
            fn = debounce(() => void counter++, 10)
        })

        afterEach(function () {
            clock.uninstall()
            calls.length = 0
        })

        it('rolls the delay window when called', async function () {
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
})
