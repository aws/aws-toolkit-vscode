/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

/**
 * Timeout coTimeoutbject that can handle both cancellation token- and time limit-style timeout situations.
 * @param timeoutLength Length of timeout duration (in ms)
 */
export class Timeout {
    private readonly _startTime: number
    private readonly _endTime: number
    private readonly _timer: Promise<boolean>
    public constructor(timeoutLength: number) {
        this._startTime = new Date().getTime()
        this._endTime = this._startTime + timeoutLength
        this._timer = new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(false), timeoutLength)
        })
    }

    /**
     * Returns the amount of time left from the initialization of time Timeout object and with the timeoutLength
     * Bottoms out at 0
     */
    public get remainingTime(): number {
        const curr = new Date().getTime()

        return (this._endTime - curr > 0 ? this._endTime - curr : 0)
    }

    /**
     * Returns a promise that times out after timeoutLength ms have passed since Timeout object initialization
     * Use this in Promise.race() calls in order to time out awaited functions
     * Once this timer has finished, cannot be restarted
     */
    public get timer(): Promise<boolean> {
        return this._timer
    }

    /**
     * Returns the elapsed time from the initial Timeout object creation
     * Useful for telemetry reporting!
     */
    public get elapsedTime(): number {
        return new Date().getTime() - this._startTime
    }
}
