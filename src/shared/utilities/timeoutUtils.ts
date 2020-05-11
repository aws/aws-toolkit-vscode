/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
            this.timerTimeout = setTimeout(reject, timeoutLength)
            this.timerResolve = resolve
        })
    }

    /**
     * Returns the amount of time left from the initialization of time Timeout object and with the timeoutLength
     * Bottoms out at 0
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
