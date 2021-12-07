/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'
import { sleep } from './promiseUtilities'

export const TIMEOUT_EXPIRED_MESSAGE = 'Timeout token expired'
export const TIMEOUT_CANCELLED_MESSAGE = 'Timeout token cancelled'
export const TIMEOUT_UNEXPECTED_RESOLVE = 'Promise resolved with an unexpected object'

export class TimeoutError extends Error {
    public constructor(public readonly type: 'expired' | 'cancelled') {
        super(type === 'cancelled' ? TIMEOUT_CANCELLED_MESSAGE : TIMEOUT_EXPIRED_MESSAGE)
    }

    public static isCancelled(err: any): err is TimeoutError & { type: 'cancelled' } {
        return err instanceof TimeoutError && err.type === 'cancelled'
    }
}

/**
 * Timeout that can handle both cancellation token-style and time limit-style timeout situations. Timeouts
 * cannot be used after 'complete' has been called or if the Timeout expired.
 *
 * @param timeoutLength Length of timeout duration (in ms)
 */
export class Timeout {
    private startTime: number
    private endTime: number
    private readonly timeoutLength: number
    private readonly timerPromise: Promise<undefined>
    private timerTimeout: NodeJS.Timeout
    private timerResolve!: (value?: Promise<undefined> | undefined) => void
    private timerReject!: (value?: Error | Promise<Error> | undefined) => void
    private _completed: boolean = false

    public constructor(timeoutLength: number) {
        this.startTime = globals.clock.Date.now()
        this.endTime = this.startTime + timeoutLength
        this.timeoutLength = timeoutLength

        this.timerPromise = new Promise<undefined>((resolve, reject) => {
            this.timerReject = reject
            this.timerResolve = resolve
        })

        this.timerTimeout = globals.clock.setTimeout(() => {
            this.timerReject(new TimeoutError('expired'))
            this._completed = true
        }, timeoutLength)
    }

    /**
     * Time (in milliseconds) remaining since this Timeout object was initialized.
     *
     * Minimum is 0.
     */
    public get remainingTime(): number {
        const remainingTime = this.endTime - globals.clock.Date.now()

        return remainingTime > 0 ? remainingTime : 0
    }

    /**
     * True when the Timeout has completed
     */
    public get completed(): boolean {
        return this._completed
    }

    /**
     * Updates the timer to timeout in timeout length from now
     */
    public refresh() {
        if (this._completed === true) {
            return
        }

        // These will not align, but we don't have visibility into a NodeJS.Timeout
        // so remainingtime will be approximate. Timers are approximate anyway and are
        // not highly accurate in when they fire.
        this.endTime = globals.clock.Date.now() + this.timeoutLength
        this.timerTimeout = this.timerTimeout.refresh()
    }

    /**
     * Returns a promise that times out after timeoutLength ms have passed since Timeout object initialization
     * Use this in Promise.race() calls in order to time out awaited functions
     * Once this timer has finished, cannot be restarted
     */
    public get timer(): Promise<undefined> {
        return this.timerPromise
    }

    /**
     * Returns the elapsed time from the initial Timeout object creation
     */
    public get elapsedTime(): number {
        return (this._completed ? this.endTime : globals.clock.Date.now()) - this.startTime
    }

    /**
     * Marks the Timeout token as being completed, preventing further use and locking in the elapsed time.
     *
     * Note that completing the token but not rejecting it is equivalent to 'freeing' any resources associated
     * with the timer, given that they do not wait for the timer Promise to resolve.
     *
     * @param reject Rejects the token with a cancelled error message
     */
    public complete(reject?: boolean): void {
        // Caller tried to call complete after the token expired
        if (this._completed === true) {
            return
        }

        this.endTime = globals.clock.Date.now()
        globals.clock.clearTimeout(this.timerTimeout)

        if (reject) {
            this.timerReject(new TimeoutError('cancelled'))
        } else {
            this.timerResolve()
        }

        this._completed = true
    }
}

/**
 * Invokes `fn()` until it returns a non-undefined value.
 *
 * @param fn  Function whose result is checked
 * @param opt.timeout  Timeout in ms (default: 5000)
 * @param opt.interval  Interval in ms between fn() checks (default: 500)
 * @param opt.truthy  Wait for "truthy" result, else wait for any defined result including `false` (default: true)
 *
 * @returns Result of `fn()`, or `undefined` if timeout was reached.
 */
export async function waitUntil<T>(
    fn: () => Promise<T>,
    opt: { timeout: number; interval: number; truthy: boolean } = { timeout: 5000, interval: 500, truthy: true }
): Promise<T | undefined> {
    for (let i = 0; true; i++) {
        const start: number = globals.clock.Date.now()
        let result: T

        // Needed in case a caller uses a 0 timeout (function is only called once)
        if (opt.timeout > 0) {
            result = await Promise.race([fn(), new Promise<T>(r => globals.clock.setTimeout(r, opt.timeout))])
        } else {
            result = await fn()
        }

        // Ensures that we never overrun the timeout
        opt.timeout -= globals.clock.Date.now() - start

        if ((opt.truthy && result) || (!opt.truthy && result !== undefined)) {
            return result
        }
        if (i * opt.interval >= opt.timeout) {
            return undefined
        }

        await sleep(opt.interval)
    }
}

/**
 * Race a Timeout object against a Promise. Handles Timeout expiration and cancellation, exposing access through
 * the use of callbacks. Timeout tokens are cleaned up automatically after completion. Set `opt.completeTimeout`
 * to false if this is not desired.
 *
 * @param promise Promise or a function that evaluates to a promise
 * @param timeout Timeout token that will race against the promise
 * @param opt.allowUndefined Output promise can resolve undefined (default: true)
 * @param opt.onExpire Callback for when the promise expired. The callback can return a value
 * @param opt.onCancel Callback for when the promise was cancelled. The callback can return a value
 * @param opt.completeTimeout Automatically completes the Timeout upon resolution (default: true)
 *
 * @returns A Promise that returns if successful, or rejects when the Timeout was cancelled or expired.
 */
export function waitTimeout<T, R = void, B extends boolean = true>(
    promise: Promise<T> | (() => Promise<T>),
    timeout: Timeout, // TODO: potentially type 'completed' timers differently from active ones
    opt: {
        allowUndefined?: B
        onExpire?: () => R
        onCancel?: () => R
        completeTimeout?: boolean
    } = {}
): Promise<T | R | (true extends typeof opt.allowUndefined ? undefined : never)> {
    if (typeof promise === 'function') {
        promise = promise()
    }

    return Promise.race([promise, timeout.timer])
        .then(obj => {
            if (obj !== undefined) {
                return obj
            }
            if ((opt.allowUndefined ?? true) !== true) {
                throw new Error(TIMEOUT_UNEXPECTED_RESOLVE)
            }
            return undefined as any
        })
        .catch(err => {
            if (opt.onExpire && (err as Error).message === TIMEOUT_EXPIRED_MESSAGE) {
                return opt.onExpire()
            }
            if (opt.onCancel && (err as Error).message === TIMEOUT_CANCELLED_MESSAGE) {
                return opt.onCancel()
            }
            throw err
        })
        .finally(() => {
            if ((opt.completeTimeout ?? true) === true) {
                timeout.complete()
            }
        })
}
