/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const TIMEOUT_ERROR_MESSAGE = 'Timeout token expired'

/**
 * Timeout that can handle both cancellation token-style and time limit-style timeout situations.
 * @param timeoutLength Length of timeout duration (in ms)
 */
export class Timeout {
    private originalStartTime: number
    private startTime: number
    private endTime: number
    private readonly timeoutLength: number
    private readonly timerPromise: Promise<void>
    private timerTimeout?: NodeJS.Timeout
    private timerResolve?: (value?: void | PromiseLike<void> | undefined) => void
    public constructor(timeoutLength: number) {
        this.startTime = Date.now()
        this.originalStartTime = this.startTime
        this.endTime = this.startTime + timeoutLength
        this.timeoutLength = timeoutLength
        this.timerPromise = new Promise<void>((resolve, reject) => {
            this.timerTimeout = setTimeout(() => reject(new Error(TIMEOUT_ERROR_MESSAGE)), timeoutLength)
            this.timerResolve = resolve
        })
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
        this.timerTimeout?.refresh()
    }

    /**
     * Returns a promise that times out after timeoutLength ms have passed since Timeout object initialization
     * Use this in Promise.race() calls in order to time out awaited functions
     * Once this timer has finished, cannot be restarted
     */
    public get timer(): Promise<void> {
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
     */
    public killTimer(): void {
        if (this.timerTimeout) {
            clearTimeout(this.timerTimeout)
        }
        if (this.timerResolve) {
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
