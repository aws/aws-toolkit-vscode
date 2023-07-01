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
    private _timerTimeout: NodeJS.Timeout
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

        this._timerTimeout = globals.clock.setTimeout(() => this.stop('timeout'), timeoutLength)
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

        // These will not align, but we don't have visibility into a NodeJS.Timeout
        // so remainingtime will be approximate. Timers are approximate anyway and are
        // not highly accurate in when they fire.
        this._endTime = globals.clock.Date.now() + this._timeoutLength
        this._timerTimeout = this._timerTimeout.refresh()
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

interface WaitUntilOptions {
    /** Timeout in ms (default: 5000) */
    readonly timeout?: number
    /** Interval in ms between fn() checks (default: 500) */
    readonly interval?: number
    /** Wait for "truthy" result, else wait for any defined result including `false` (default: true) */
    readonly truthy?: boolean
}

/**
 * Invokes `fn()` until it returns a non-undefined value.
 *
 * @param fn  Function whose result is checked
 * @param options  See {@link WaitUntilOptions}
 *
 * @returns Result of `fn()`, or `undefined` if timeout was reached.
 */
export async function waitUntil<T>(fn: () => Promise<T>, options: WaitUntilOptions): Promise<T | undefined> {
    const opt = { timeout: 5000, interval: 500, truthy: true, ...options }
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
        .catch(e => (e instanceof Error ? e : new Error(`unknown error: ${e}`)))
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
    return new Promise(r => schedule(r, Math.max(duration, 0)))
}
