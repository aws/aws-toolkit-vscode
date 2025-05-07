/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { once, onceChanged, debounce, oncePerUniqueArg } from '../../../shared/utilities/functionUtils'
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

    it('oncePerUniqueArg()', function () {
        let counter = 0
        const fn = oncePerUniqueArg((s: string) => {
            counter++
            return `processed-${s}`
        })

        const result1 = fn('hello')
        assert.strictEqual(result1, 'processed-hello')
        assert.strictEqual(counter, 1, 'First call with unique arg should execute')

        const result2 = fn('hello')
        assert.strictEqual(result2, undefined)
        assert.strictEqual(counter, 1, 'Second call with same arg should not execute')

        const result3 = fn('world')
        assert.strictEqual(result3, 'processed-world')
        assert.strictEqual(counter, 2, 'Call with new arg should execute')

        fn('hello')
        fn('world')
        assert.strictEqual(counter, 2, 'Repeated calls with seen args should not execute')

        // New arg should execute
        const result4 = fn('test')
        assert.strictEqual(result4, 'processed-test')
        assert.strictEqual(counter, 3)
    })

    it('oncePerUniqueArg() with custom key', function () {
        let counter = 0
        const fn = oncePerUniqueArg(
            (_s1: string, _s2: string) => {
                counter++
            },
            { key: (s1, _s2) => s1 }
        )

        fn('hello', 'world')
        assert.strictEqual(counter, 1, 'First call with unique arg should execute')

        fn('hello', 'worldss')
        assert.strictEqual(counter, 1, 'Second arg being different should not execute')

        fn('world', 'hello')
        assert.strictEqual(counter, 2, 'First arg being different should execute')
    })

    it('oncePerUniqueArg() with overflow limit', function () {
        let counter = 0
        // Create function with small overflow limit
        const fn = oncePerUniqueArg(
            (_s: string) => {
                counter++
                return counter
            },
            { overflow: 2 }
        )

        // Fill the buffer
        fn('one')
        fn('two')
        assert.strictEqual(counter, 2)

        fn('three')
        assert.strictEqual(counter, 3, '"three" call should execute since it is a new value')

        // 'one' should now be treated as new again since it was evicted
        fn('one')
        assert.strictEqual(counter, 4, 'one should still be in the buffer')

        // 'three' should still be in the buffer (not executed)
        fn('three')
        assert.strictEqual(counter, 4, 'three should still be in the buffer')
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
