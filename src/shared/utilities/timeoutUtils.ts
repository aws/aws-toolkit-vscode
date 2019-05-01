/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

/**
 * Timeout that can handle both cancellation token-style and time limit-style timeout situations.
 * @param timeoutLength Length of timeout duration (in ms)
 */
export class Timeout {
    private readonly _startTime: number
    private readonly _endTime: number
    private readonly _timer: Promise<void>
    private _timerTimeout?: NodeJS.Timeout
    private _timerResolve?: (value?: void | PromiseLike<void> | undefined) => void
    public constructor(timeoutLength: number) {
        this._startTime = new Date().getTime()
        this._endTime = this._startTime + timeoutLength
        this._timer = new Promise<void>((resolve, reject) => {
            this.makeTimeoutHandlers(resolve, reject, timeoutLength)
        })
    }

    /**
     * Returns the amount of time left from the initialization of time Timeout object and with the timeoutLength
     * Bottoms out at 0
     */
    public get remainingTime(): number {
        const remainingTime = this._endTime - new Date().getTime()

        return (remainingTime > 0 ? remainingTime : 0)
    }

    /**
     * Returns a promise that times out after timeoutLength ms have passed since Timeout object initialization
     * Use this in Promise.race() calls in order to time out awaited functions
     * Once this timer has finished, cannot be restarted
     */
    public get timer(): Promise<void> {
        return this._timer
    }

    /**
     * Returns the elapsed time from the initial Timeout object creation
     * Useful for telemetry reporting!
     */
    public get elapsedTime(): number {
        return new Date().getTime() - this._startTime
    }

    /**
     * Kills the internal timer and resolves the timer's promise
     * Helpful for tests!
     */
    public killTimer(): void {
        if (this._timerTimeout) {
            clearTimeout(this._timerTimeout)
        }
        if (this._timerResolve) {
            this._timerResolve()
        }
    }

    /**
     * Helper function that makes the timeout (which rejects a promise) and reject values
     * accessible outside the internal timer promise
     *
     * This allows us to manually kill the timer and resolve
     * Helpful for tests!
     *
     * @param resolve resolve function from Promise
     * @param reject reject function from Promise
     * @param timeoutLength timer length
     */
    private makeTimeoutHandlers(
        resolve: (value?: void | PromiseLike<void> | undefined) => void,
        reject: (reason?: any) => void,
        timeoutLength: number
    ) {
        this._timerTimeout = setTimeout(reject, timeoutLength)
        this._timerResolve = resolve
    }
}
