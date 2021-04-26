/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const TIMEOUT_EXPIRED_MESSAGE = 'Timeout token expired'
export const TIMEOUT_CANCELLED_MESSAGE = 'Timeout token cancelled'
export const TIMEOUT_UNEXPECTED_RESOLVE = 'Timeout resolved with an unexpected object'

/**
 * Timeout that can handle both cancellation token-style and time limit-style timeout situations.
 * @param timeoutLength Length of timeout duration (in ms)
 */
export class Timeout {
    private originalStartTime: number
    private startTime: number
    private endTime: number
    private readonly timeoutLength: number
    private readonly timerPromise: Promise<undefined>
    private timerTimeout: NodeJS.Timeout
    private timerResolve!: (value?: Promise<undefined> | undefined) => void
    private timerReject!: (value?: Error | Promise<Error> | undefined) => void
    public constructor(timeoutLength: number) {
        this.startTime = Date.now()
        this.originalStartTime = this.startTime
        this.endTime = this.startTime + timeoutLength
        this.timeoutLength = timeoutLength
        this.timerPromise = new Promise<undefined>((resolve, reject) => {
            this.timerReject = reject
            this.timerResolve = resolve
        })
        this.timerTimeout = setTimeout(() => this.timerReject(new Error(TIMEOUT_EXPIRED_MESSAGE)), timeoutLength)
    }

    /**
     * Time (in milliseconds) remaining since this Timeout object was initialized.
     *
     * Minimum is 0.
     */
    public get remainingTime(): number {
        const remainingTime = this.endTime - Date.now()

        return remainingTime > 0 ? remainingTime : 0
    }

    /**
     * Updates the timer to timeout in timeout length from now
     */
    public refresh() {
        // These will not align, but we don't have visibility into a NodeJS.Timeout
        // so remainingtime will be approximate. Timers are approximate anyway and are
        // not highly accurate in when they fire.
        this.startTime = Date.now()
        this.endTime = this.startTime + this.timeoutLength
        this.timerTimeout.refresh()
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
        return Date.now() - this.originalStartTime
    }

    /**
     * Kills the internal timer and resolves the timer's promise
     * @param reject Rejects the token with a cancelled error message
     */
    public killTimer(reject?: boolean): void {
        clearTimeout(this.timerTimeout!)
        if (reject) {
            this.timerReject(new Error(TIMEOUT_CANCELLED_MESSAGE))
        } else {
            this.timerResolve()
        }
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
        const start: number = Date.now()
        let result: T

        // Needed in case a caller uses a 0 timeout (function is only called once)
        if (opt.timeout > 0) {
            result = await Promise.race([fn(), new Promise<T>(r => setTimeout(r, opt.timeout))])
        } else {
            result = await fn()
        }

        // Ensures that we never overrun the timeout
        opt.timeout -= Date.now() - start

        if ((opt.truthy && result) || (!opt.truthy && result !== undefined)) {
            return result
        }
        if (i * opt.interval >= opt.timeout) {
            return undefined
        }

        await new Promise(r => setTimeout(r, opt.interval))
    }
}

/**
 * Utility function to wrap a Timeout token around a Promise.
 *
 * @param promise The promise to use a Timeout with
 * @param timeout A Timeout token that will race against the promise
 * @param opt.noUndefined Prevents the promise from being resolved undefined (default: false)
 * @param opt.onExpire Callback for when the promise expired. The callback can return a value
 * @param opt.onCancel Callback for when the promise was cancelled. The callback can return a value
 *
 * @returns A Promise that resolves into a valid return value, or rejects when the Timeout was cancelled or expired.
 */
export function createTimedPromise<T>(
    promise: Promise<T>,
    timeout: Timeout,
    opt: { noUndefined?: boolean; onExpire?: () => T | undefined; onCancel?: () => T | undefined } = {}
): Promise<T | undefined> {
    return Promise.race([promise, timeout.timer]).then(
        obj => {
            if (opt.noUndefined && obj === undefined) {
                throw new Error(TIMEOUT_UNEXPECTED_RESOLVE)
            }
            if (obj !== undefined) {
                return obj
            }
            return undefined
        },
        err => {
            if (opt.onExpire && (err as Error).message === TIMEOUT_EXPIRED_MESSAGE) {
                return opt.onExpire()
            }
            if (opt.onCancel && (err as Error).message === TIMEOUT_CANCELLED_MESSAGE) {
                return opt.onCancel()
            }
            throw err
        }
    )
}
