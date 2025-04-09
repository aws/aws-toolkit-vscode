/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'
import { CancellationToken, EventEmitter, Event } from 'vscode'

export const timeoutExpiredMessage = 'Timeout token expired'
export const timeoutCancelledMessage = 'Timeout token cancelled'
export const timeoutUnexpectedResolve = 'Promise resolved with an unexpected object'

type CancellationAgent = 'user' | 'timeout'
export class CancellationError extends Error {
    public constructor(public readonly agent: CancellationAgent) {
        super(agent === 'user' ? timeoutCancelledMessage : timeoutExpiredMessage)
    }

    public static isUserCancelled(err: any): err is CancellationError & { agent: 'user' } {
        return err instanceof CancellationError && err.agent === 'user'
    }

    public static isExpired(err: any): err is CancellationError & { agent: 'timeout' } {
        return err instanceof CancellationError && err.agent === 'timeout'
    }
}

export interface CancelEvent {
    readonly agent: CancellationAgent
}

/** A {@link CancellationToken} that provides a reason for the cancellation event. */
interface TypedCancellationToken extends CancellationToken {
    readonly onCancellationRequested: Event<CancelEvent>
}

/**
 * Timeout that can handle both cancellation token-style and time limit-style timeout situations. Timeouts
 * cannot be used after 'complete' has been called or if the Timeout expired.
 */
export class Timeout {
    private _startTime: number
    private _endTime: number
    private readonly _timeoutLength: number
    /** In the browser the timeout is a number */
    private _timerTimeout: NodeJS.Timeout | number
    private _completionReason?: CancellationAgent | 'completed'
    private readonly _token: TypedCancellationToken
    private readonly _onCancellationRequestedEmitter = new EventEmitter<CancelEvent>()
    private readonly _onCompletionEmitter = new EventEmitter<void>()
    public readonly onCompletion = this._onCompletionEmitter.event

    /**
     * @param timeoutLength Timeout duration (in ms)
     */
    public constructor(timeoutLength: number) {
        this._startTime = globals.clock.Date.now()
        this._endTime = this._startTime + timeoutLength
        this._timeoutLength = timeoutLength

        this._token = {
            isCancellationRequested: false,
            onCancellationRequested: this._onCancellationRequestedEmitter.event,
        }

        Object.defineProperty(this._token, 'isCancellationRequested', {
            get: () => this._completionReason === 'user' || this._completionReason === 'timeout',
        })

        this._timerTimeout = this.createTimeout()
    }

    /**
     * Time (in milliseconds) remaining since this Timeout object was initialized.
     *
     * Minimum is 0.
     */
    public get remainingTime(): number {
        const remainingTime = this._endTime - globals.clock.Date.now()

        return remainingTime > 0 ? remainingTime : 0
    }

    /**
     * True when the Timeout has completed
     */
    public get completed(): boolean {
        return !!this._completionReason
    }

    /**
     * Updates the timer to timeout in timeout length from now
     */
    public refresh() {
        if (this.completed) {
            return
        }

        // Web mode timeout is a number and does not have a refresh method
        if (typeof this._timerTimeout === 'number') {
            globals.clock.clearTimeout(this._timerTimeout)
            this._timerTimeout = this.createTimeout()
        } else {
            // This is a node timeout instance, which has refresh built in
            this._timerTimeout = this._timerTimeout.refresh()
        }

        // These will not align, but we don't have visibility into a NodeJS.Timeout
        // so remainingtime will be approximate. Timers are approximate anyway and are
        // not highly accurate in when they fire.
        this._endTime = globals.clock.Date.now() + this._timeoutLength
    }

    /**
     * Returns a token suitable for use in-place of VS Code's {@link CancellationToken}
     */
    public get token(): TypedCancellationToken {
        return this._token
    }

    /**
     * Returns the elapsed time (ms) from the initial Timeout object creation
     */
    public get elapsedTime(): number {
        return (this.completed ? this._endTime : globals.clock.Date.now()) - this._startTime
    }

    private createTimeout() {
        return globals.clock.setTimeout(() => this.stop('timeout'), this._timeoutLength)
    }

    private stop(type: CancellationAgent | 'completed'): void {
        if (this.completed) {
            return
        }

        this._completionReason = type
        this._endTime = globals.clock.Date.now()
        globals.clock.clearTimeout(this._timerTimeout)

        if (type !== 'completed') {
            this._onCancellationRequestedEmitter.fire({ agent: type })
        }

        this._onCancellationRequestedEmitter.dispose()
        this._onCompletionEmitter.fire()
        this._onCompletionEmitter.dispose()
    }

    /**
     * Cancels the timer, notifying any subscribing of the cancellation and locking in the time.
     *
     * This always assumes cancellation was caused by the user. Use {@link dispose} when the Timeout is no longer needed.
     */
    public cancel(): void {
        this.stop('user')
    }

    /**
     * Marks the Timeout token as being completed, preventing further use and locking in the elapsed time.
     *
     * Any listeners still using this token will receive a 'cancelled' event.
     */
    public dispose(): void {
        this.stop('completed')
    }

    /**
     * Turns the `Timeout` object into a Promise that resolves on completion or rejects on cancellation/expiration.
     *
     * Prefer using {@link token} when possible as using Promises is not as robust.
     */
    public promisify(): Promise<void | never> {
        if (this._completionReason === 'completed') {
            return Promise.resolve()
        } else if (this._completionReason) {
            return Promise.reject(new CancellationError(this._completionReason))
        }

        return new Promise((resolve, reject) => {
            this._onCompletionEmitter.event(resolve)
            this._onCancellationRequestedEmitter.event(({ agent }) => reject(new CancellationError(agent)))
        })
    }
}

export class Interval {
    private _setCompleted: (() => void) | undefined
    private _nextCompletion: Promise<void>
    private ref: NodeJS.Timer | number | undefined

    constructor(intervalMillis: number, onCompletion: () => Promise<void>) {
        this._nextCompletion = new Promise<void>((resolve) => {
            this._setCompleted = () => resolve()
        })
        this.ref = globals.clock.setInterval(async () => {
            await onCompletion()
            this._setCompleted!()
            this._nextCompletion = new Promise<void>((resolve) => {
                this._setCompleted = () => resolve()
            })
        }, intervalMillis)
    }

    /** Allows to wait for the next interval to finish running */
    public async nextCompletion() {
        await this._nextCompletion
    }

    public dispose() {
        globals.clock.clearInterval(this.ref)
    }
}

interface WaitUntilOptions {
    /** Timeout in ms (default: 5000) */
    readonly timeout?: number
    /** Interval in ms between fn() checks (default: 500) */
    readonly interval?: number
    /** Wait for "truthy" result, else wait for any defined result including `false` (default: true) */
    readonly truthy?: boolean
    /** A backoff multiplier for how long the next interval will be (default: None, i.e 1) */
    readonly backoff?: number
    /**
     * Only retries when an error is thrown, otherwise returning the immediate result.
     * Can also be a callback for conditional retry based on errors
     * - 'truthy' arg is ignored
     * - If the timeout is reached it throws the last error
     * - default: false
     */
    readonly retryOnFail?: boolean | ((error: Error) => boolean)
}

export const waitUntilDefaultTimeout = 2000
export const waitUntilDefaultInterval = 500

/**
 * Invokes `fn()` on an interval based on the given arguments. This can be used for retries, or until
 * an expected result is given. Read {@link WaitUntilOptions} carefully.
 *
 * @param fn  Function whose result is checked
 * @param options  See {@link WaitUntilOptions}
 *
 * @returns Result of `fn()`, or possibly `undefined` depending on the arguments.
 */
export async function waitUntil<T>(fn: () => Promise<T>, options: WaitUntilOptions & { retryOnFail: true }): Promise<T>
export async function waitUntil<T>(
    fn: () => Promise<T>,
    options: WaitUntilOptions & { retryOnFail: false }
): Promise<T | undefined>
export async function waitUntil<T>(
    fn: () => Promise<T>,
    options: WaitUntilOptions & { retryOnFail: (error: Error) => boolean }
): Promise<T>

export async function waitUntil<T>(
    fn: () => Promise<T>,
    options: Omit<WaitUntilOptions, 'retryOnFail'>
): Promise<T | undefined>
export async function waitUntil<T>(fn: () => Promise<T>, options: WaitUntilOptions): Promise<T | undefined> {
    // set default opts
    const opt = {
        timeout: waitUntilDefaultTimeout,
        interval: waitUntilDefaultInterval,
        truthy: true,
        backoff: 1,
        retryOnFail: false,
        ...options,
    }

    let interval = opt.interval
    let lastError: Error | undefined
    let elapsed: number = 0
    let remaining = opt.timeout

    // Internal helper to determine if we should retry
    function shouldRetry(error: Error | undefined): boolean {
        if (error === undefined) {
            return typeof opt.retryOnFail === 'boolean' ? opt.retryOnFail : true
        }
        if (typeof opt.retryOnFail === 'function') {
            return opt.retryOnFail(error)
        }
        return opt.retryOnFail
    }

    for (let i = 0; true; i++) {
        const start: number = globals.clock.Date.now()
        let result: T

        try {
            // Needed in case a caller uses a 0 timeout (function is only called once)
            if (remaining > 0) {
                result = await Promise.race([fn(), new Promise<T>((r) => globals.clock.setTimeout(r, remaining))])
            } else {
                result = await fn()
            }

            if (shouldRetry(lastError) || (opt.truthy && result) || (!opt.truthy && result !== undefined)) {
                return result
            }
        } catch (e) {
            // Unlikely to hit this, but exists for typing
            if (!(e instanceof Error)) {
                throw e
            }

            if (!shouldRetry(e)) {
                throw e
            }

            lastError = e
        }

        // Ensures that we never overrun the timeout
        remaining -= globals.clock.Date.now() - start

        // If the sleep will exceed the timeout, abort early
        if (elapsed + interval >= remaining) {
            if (!shouldRetry(lastError)) {
                return undefined
            }
            throw lastError
        }

        // when testing, this avoids the need to progress the stubbed clock
        if (interval > 0) {
            await sleep(interval)
        }

        elapsed += interval
        interval = interval * opt.backoff
    }
}

/**
 * @deprecated Prefer using event-driven timeout mechanisms over racing promises.
 *
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
export async function waitTimeout<T, R = void, B extends boolean = true>(
    promise: Promise<T> | (() => Promise<T>),
    timeout: Timeout,
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

    const result = await Promise.race([promise, timeout.promisify()])
        .catch((e) => (e instanceof Error ? e : new Error(`unknown error: ${e}`)))
        .finally(() => {
            if ((opt.completeTimeout ?? true) === true) {
                timeout.dispose()
            }
        })

    if (result instanceof Error) {
        if (opt.onExpire && CancellationError.isExpired(result)) {
            return opt.onExpire()
        }
        if (opt.onCancel && CancellationError.isUserCancelled(result)) {
            return opt.onCancel()
        }
        throw result
    }

    if (result === undefined && (opt.allowUndefined ?? true) !== true) {
        throw new Error(timeoutUnexpectedResolve)
    }

    return result as T
}

/**
 * Sleeps for the specified duration in milliseconds. Note that a duration of 0 will always wait 1 event loop.
 *
 * Attempts to use the extension-scoped `setTimeout` if it exists, otherwise will fallback to the global scheduler.
 */
export function sleep(duration: number = 0): Promise<void> {
    const schedule = globals?.clock?.setTimeout ?? setTimeout
    return new Promise((r) => schedule(r, Math.max(duration, 0)))
}

/**
 * Similar to waitUntil but with enhanced cancellation support.
 * Waits until the predicate returns true or the operation is cancelled.
 * Continuously checks for cancellation even when waiting for the next chunk.
 *
 * @param fn Function whose result is checked
 * @param options Configuration options including timeout, interval, and cancellation token
 * @returns Result of fn(), or undefined if cancelled
 */
export async function waitUntilWithCancellation<T>(
    fn: () => Promise<T>,
    options: WaitUntilOptions & {
        cancellationToken: CancellationToken
    }
): Promise<T | undefined> {
    const { cancellationToken, ...waitOptions } = options

    // Set up cancellation listener
    let cancellationListener: { dispose: () => void } | undefined
    let checkInterval: NodeJS.Timeout | number | undefined
    let isCancelled = false

    try {
        return await new Promise<T | undefined>((resolve, reject) => {
            // Set up cancellation listener that will resolve with undefined instead of rejecting
            if (cancellationToken) {
                cancellationListener = cancellationToken.onCancellationRequested(() => {
                    if (checkInterval) {
                        globals.clock.clearInterval(checkInterval)
                    }
                    isCancelled = true
                    resolve(undefined) // Resolve with undefined instead of rejecting
                })
            }

            // Use the existing waitUntil function with a wrapper that checks for cancellation
            waitUntil(
                async () => {
                    // Check for cancellation before executing function
                    if (cancellationToken.isCancellationRequested) {
                        isCancelled = true
                        return undefined // Return undefined to signal cancellation
                    }

                    const result = await fn()

                    // Check for cancellation after executing function
                    if (cancellationToken.isCancellationRequested) {
                        isCancelled = true
                        return undefined // Return undefined to signal cancellation
                    }

                    return result
                },
                {
                    ...waitOptions,
                    retryOnFail: (error) => {
                        // Don't retry if cancelled
                        if (isCancelled) {
                            return false
                        }

                        // Use the original retryOnFail option if provided
                        if (typeof waitOptions.retryOnFail === 'function') {
                            return waitOptions.retryOnFail(error)
                        }
                        return waitOptions.retryOnFail ?? false
                    },
                }
            )
                .then((result) => {
                    // If cancelled during execution, resolve with undefined
                    if (isCancelled) {
                        resolve(undefined)
                    } else {
                        resolve(result)
                    }
                })
                .catch((error) => {
                    // If cancelled during execution, resolve with undefined
                    if (isCancelled) {
                        resolve(undefined)
                    } else {
                        reject(error)
                    }
                })

            // Set up an interval to periodically check for cancellation
            // This ensures we don't miss cancellation events while waiting for the next chunk
            checkInterval = globals.clock.setInterval(
                () => {
                    if (cancellationToken.isCancellationRequested && !isCancelled) {
                        isCancelled = true
                        globals.clock.clearInterval(checkInterval)
                        resolve(undefined) // Resolve with undefined instead of rejecting
                    }
                },
                Math.min(waitOptions.interval ?? waitUntilDefaultInterval, 100)
            )
        })
    } finally {
        // Clean up resources
        if (checkInterval) {
            globals.clock.clearInterval(checkInterval)
        }
        if (cancellationListener) {
            cancellationListener.dispose()
        }
    }
}
