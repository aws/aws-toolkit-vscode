/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as timeoutUtils from '../../../shared/utilities/timeoutUtils'
import { installFakeClock, tickPromise } from '../../../test/testUtil'
import { sleep } from '../../../shared/utilities/timeoutUtils'

describe('timeoutUtils', async function () {
    let clock: FakeTimers.InstalledClock

    before(function () {
        clock = installFakeClock()
    })

    after(function () {
        clock.uninstall()
    })

    afterEach(function () {
        clock.reset()
        this.timer?.dispose()
    })

    describe('Timeout', async function () {
        it('returns > 0 if the timer is still active', async function () {
            const timerLengthMs = 100
            const longTimer = (this.timer = new timeoutUtils.Timeout(timerLengthMs))
            clock.tick(timerLengthMs / 2)
            assert.strictEqual(longTimer.remainingTime > 0, true)
        })

        it('returns 0 if timer is expired', async function () {
            const timerLengthMs = 10
            const shortTimer = (this.timer = new timeoutUtils.Timeout(timerLengthMs))
            clock.tick(timerLengthMs + 1)
            assert.strictEqual(shortTimer.remainingTime, 0)
        })

        it('returns a Promise if a timer is active', async function () {
            const longTimer = (this.timer = new timeoutUtils.Timeout(300))
            assert.strictEqual(longTimer.promisify() instanceof Promise, true)
        })

        it('timer object rejects if a timer is expired', async function () {
            const timerLengthMs = 10
            const shortTimer = (this.timer = new timeoutUtils.Timeout(timerLengthMs))
            clock.tick(timerLengthMs + 1)
            await assert.rejects(
                shortTimer.promisify(),
                new Error(timeoutUtils.timeoutExpiredMessage),
                'Timer did not reject due to timeout'
            )
        })

        it('expiration error does not happen when refreshing a completed timer', async function () {
            const timerLengthMs = 10
            const shortTimer = (this.timer = new timeoutUtils.Timeout(timerLengthMs))
            shortTimer.dispose()
            clock.tick(timerLengthMs + 1)
            shortTimer.refresh()
            await tickPromise(assert.doesNotReject(shortTimer.promisify()), clock, timerLengthMs + 1)
        })

        it('successfully kills active timers', async function () {
            const longTimer = (this.timer = new timeoutUtils.Timeout(300))
            // make sure this is an active Promise
            assert.strictEqual(longTimer.promisify() instanceof Promise, true)
            longTimer.dispose()
            clock.tick(400)

            // if the timer was not killed, promise will reject
            await longTimer.promisify()
        })

        it('correctly reports an elapsed time', async function () {
            const checkTimerMs = 50
            const longTimer = (this.timer = new timeoutUtils.Timeout(checkTimerMs * 6))

            // Simulate a small amount of time, then measure elapsed time
            clock.tick(checkTimerMs)

            assert.strictEqual(longTimer.elapsedTime, checkTimerMs)
        })

        it('correctly reports an elapsed time after completion', async function () {
            const checkTimerMs = 50
            const longTimer = (this.timer = new timeoutUtils.Timeout(checkTimerMs * 6))

            clock.tick(checkTimerMs)
            longTimer.dispose()
            clock.tick(checkTimerMs)

            assert.strictEqual(longTimer.elapsedTime, checkTimerMs)
        })

        it('Correctly reports elapsed time with refresh', async function () {
            const longTimer = (this.timer = new timeoutUtils.Timeout(10))
            clock.tick(5)
            longTimer.refresh()
            assert.strictEqual(longTimer.remainingTime, 10)

            clock.tick(5)
            assert.strictEqual(longTimer.elapsedTime, 10)
            assert.strictEqual(longTimer.remainingTime, 5)
        })

        it('Refresh pushes back the start time', async function () {
            const longTimer = (this.timer = new timeoutUtils.Timeout(10))
            clock.tick(5)
            longTimer.refresh()
            assert.strictEqual(longTimer.remainingTime, 10)
        })

        it('does not reject if refreshed', async function () {
            const longTimer = (this.timer = new timeoutUtils.Timeout(10))
            clock.tick(5)
            longTimer.refresh()
            clock.tick(6)
            longTimer.dispose()
            clock.tick(10)
            await longTimer.promisify()
        })

        describe('onCompletion', function () {
            const checkTimerMs = 10
            let timer: timeoutUtils.Timeout
            let completion: Promise<void>

            beforeEach(function () {
                timer = this.timer = new timeoutUtils.Timeout(checkTimerMs * 6)
                completion = new Promise<void>((resolve, reject) => {
                    timer.onCompletion(resolve)
                    setTimeout(() => reject(new Error('Timed out waiting for event')), 10000)
                })
            })

            it('fires when completed', async function () {
                timer.dispose()
                await completion
            })

            it('fires when cancelled', async function () {
                timer.cancel()
                await completion
            })

            it('fires when expired', async function () {
                clock.tick(checkTimerMs * 10)
                await completion
            })
        })

        describe('token', function () {
            const checkTimerMs = 10
            let timer: timeoutUtils.Timeout
            let cancellation: Promise<'user' | 'timeout' | 'completed'>

            beforeEach(function () {
                timer = this.timer = new timeoutUtils.Timeout(checkTimerMs * 6)
                cancellation = new Promise<'user' | 'timeout' | 'completed'>((resolve, reject) => {
                    timer.token.onCancellationRequested(({ agent }) => resolve(agent))
                    timer.onCompletion(() => resolve('completed'))
                    setTimeout(() => reject(new Error('Timed out waiting for event')), 1000)
                })
            })

            it('shows that a cancellation is requested after cancel', async function () {
                assert.strictEqual(timer.token.isCancellationRequested, false)
                timer.cancel()
                assert.strictEqual(timer.token.isCancellationRequested, true)
                assert.strictEqual(await cancellation, 'user')
            })

            it('shows that a cancellation is requested after expiration', async function () {
                assert.strictEqual(timer.token.isCancellationRequested, false)
                clock.tick(checkTimerMs * 10)
                assert.strictEqual(timer.token.isCancellationRequested, true)
                assert.strictEqual(await cancellation, 'timeout')
            })

            it('does not show that a cancellation is requested after completion', async function () {
                assert.strictEqual(timer.token.isCancellationRequested, false)
                timer.dispose()
                assert.strictEqual(timer.token.isCancellationRequested, false)
                assert.strictEqual(await cancellation, 'completed')
            })
        })
    })

    describe('waitUntil', async function () {
        const testSettings = {
            callCounter: 0,
            callGoal: 0,
            functionDelay: 10,
            clockInterval: 1,
            clockSpeed: 5,
        }

        let fastClock: NodeJS.Timeout

        // Test function, increments a counter every time it is called
        async function testFunction(): Promise<number | undefined> {
            if (++testSettings.callCounter >= testSettings.callGoal) {
                return testSettings.callGoal
            } else {
                return undefined
            }
        }

        // Simple wrapper that waits until calling testFunction
        async function slowTestFunction(): Promise<number | undefined> {
            await sleep(testSettings.functionDelay)
            return testFunction()
        }

        before(function () {
            clock.uninstall()

            // Makes a clock that runs clockSpeed times as fast as a normal clock (uses 1ms intervals)
            // This works since we create an interval with the system clock, then trigger our fake clock with it
            fastClock = setInterval(() => {
                clock.tick(testSettings.clockSpeed * testSettings.clockInterval)
            }, testSettings.clockInterval)

            clock = installFakeClock()
        })

        after(function () {
            clearInterval(fastClock)
        })

        beforeEach(function () {
            testSettings.callCounter = 0
            testSettings.functionDelay = 10
        })

        it('returns value after multiple function calls', async function () {
            testSettings.callGoal = 4
            const returnValue: number | undefined = await timeoutUtils.waitUntil(testFunction, {
                timeout: 10000,
                interval: 10,
                truthy: false,
            })
            assert.strictEqual(returnValue, testSettings.callGoal)
        })

        it('timeout before function returns defined value', async function () {
            testSettings.callGoal = 7
            const returnValue: number | undefined = await timeoutUtils.waitUntil(testFunction, {
                timeout: 30,
                interval: 10,
                truthy: false,
            })
            assert.strictEqual(returnValue, undefined)
        })

        it('returns true/false values correctly', async function () {
            assert.strictEqual(
                true,
                await timeoutUtils.waitUntil(async () => true, { timeout: 10000, interval: 10, truthy: false })
            )
            assert.strictEqual(
                false,
                await timeoutUtils.waitUntil(async () => false, { timeout: 10000, interval: 10, truthy: false })
            )
        })

        it('timeout when function takes longer than timeout parameter', async function () {
            testSettings.functionDelay = 100
            const returnValue: number | undefined = await timeoutUtils.waitUntil(slowTestFunction, {
                timeout: 50,
                interval: 10,
                truthy: false,
            })
            assert.strictEqual(returnValue, undefined)
        })

        it('timeout from slow function calls', async function () {
            testSettings.callGoal = 10
            const returnValue: number | undefined = await timeoutUtils.waitUntil(slowTestFunction, {
                timeout: 50,
                interval: 10,
                truthy: false,
            })
            assert.strictEqual(returnValue, undefined)
        })

        it('returns value with after multiple calls and function delay ', async function () {
            testSettings.callGoal = 3
            testSettings.functionDelay = 5
            const returnValue: number | undefined = await timeoutUtils.waitUntil(slowTestFunction, {
                timeout: 10000,
                interval: 5,
                truthy: false,
            })
            assert.strictEqual(returnValue, testSettings.callGoal)
        })

        it('returns value after setting truthy parameter to true', async function () {
            let counter: number = 0
            const result: boolean | undefined = await timeoutUtils.waitUntil(async () => counter++ === 5, {
                timeout: 1000,
                interval: 5,
                truthy: true,
            })
            assert.strictEqual(result, true)
        })

        it('timeout after setting truthy parameter to true', async function () {
            let counter: number = 0
            const result: boolean | undefined = await timeoutUtils.waitUntil(async () => counter++ === 5, {
                timeout: 15,
                interval: 5,
                truthy: true,
            })
            assert.strictEqual(result, undefined)
        })
    })

    describe('waitTimeout', async function () {
        async function testFunction(delay: number = 500, error?: Error) {
            await sleep(delay)

            if (error) {
                throw error
            }

            return 'test'
        }

        it('triggers "onExpire" callback', async function () {
            const timeout = new timeoutUtils.Timeout(200)
            const timedPromise = timeoutUtils.waitTimeout(testFunction(), timeout, { onExpire: () => 'expire' })
            clock.tick(300)
            assert.strictEqual(await timedPromise, 'expire')
        })

        it('triggers "onCancel" callback', async function () {
            const timeout = new timeoutUtils.Timeout(400)
            const timedPromise = timeoutUtils.waitTimeout(testFunction(), timeout, { onCancel: () => 'cancel' })
            clock.tick(200)
            timeout.cancel()
            assert.strictEqual(await timedPromise, 'cancel')
        })

        it('propagates exception from function', async function () {
            const timeout = new timeoutUtils.Timeout(400)
            const testError = new Error('test error')
            const timedPromise = timeoutUtils.waitTimeout(testFunction(200, testError), timeout)
            clock.tick(300)
            await assert.rejects(timedPromise, testError)
        })

        it('timer does not reject when function finishes in time', async function () {
            const timeout = new timeoutUtils.Timeout(400)
            const timedPromise = timeoutUtils.waitTimeout(testFunction(200), timeout)
            clock.tick(300)
            timeout.dispose()
            clock.tick(200)
            await assert.doesNotReject(timedPromise)
        })

        it('"allowUndefined" option set to false with undefined resolve throws error', async function () {
            const timeout = new timeoutUtils.Timeout(400)
            const timedPromise = timeoutUtils.waitTimeout(testFunction(500), timeout, { allowUndefined: false })
            clock.tick(300)
            timeout.dispose() // Promise now resolves undefined
            clock.tick(200)
            await assert.rejects(timedPromise, new Error(timeoutUtils.timeoutUnexpectedResolve))
        })

        it('"completeTimeout" option set to false throws expired error', async function () {
            const timeout = new timeoutUtils.Timeout(800)
            const timedPromise = timeoutUtils.waitTimeout(testFunction(500), timeout, { completeTimeout: false })
            clock.tick(600)
            await timedPromise
            clock.tick(300)
            await assert.rejects(timeout.promisify(), new Error(timeoutUtils.timeoutExpiredMessage))
        })
    })
})
