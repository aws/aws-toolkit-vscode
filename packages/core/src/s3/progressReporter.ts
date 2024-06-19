/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { throttle } from 'lodash'
import { getLogger } from '../shared/logger/logger'
import bytes from 'bytes'

const defaultReportingIntervalMillis = 250

interface ProgressReporterOptions {
    readonly totalBytes?: number
    readonly reportMessage?: boolean
    readonly minIntervalMillis?: number
}

/**
 * Returns a function that pipes incremental byte progress to VSCode's incremental percentage Progress.
 *
 * @param progress the VSCode progress to update.
 * @param totalBytes the total bytes.
 * Used in combination with cumulative bytes to calculate incremental progress.
 * @param minIntervalMillis the minimum delay between progress updates.
 * Used to throttle updates. Updates that occur between intervals are dropped.
 */
export function progressReporter(
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    options: ProgressReporterOptions = {}
): (loadedBytes: number) => void {
    const { totalBytes, reportMessage, minIntervalMillis } = options
    const reporter = new ProgressReporter(progress, { totalBytes, reportMessage })
    const reportProgressThrottled = throttle(
        () => reporter.report(),
        minIntervalMillis ?? defaultReportingIntervalMillis,
        { leading: true, trailing: false }
    )

    return newBytes => {
        reporter.update(newBytes)

        if (reporter.done) {
            reporter.report()
        } else {
            reportProgressThrottled()
        }
    }
}

/**
 * Tracks incremental and total progress in terms of bytes and percentages.
 */
class ProgressReporter {
    private _incrementalProgress = 0
    private _loadedBytes = 0
    private _totalBytes: number | undefined

    /**
     * Creates a ProgressReport.
     *
     * @param _totalBytes the total bytes, or undefined if total bytes are unknown.
     * Used in combination with cumulative bytes to calculate incremental progress.
     *
     * If 0 is provided, progress is returned as 100%.
     *
     * @throw Error if _totalBytes is not an integer or is negative.
     */
    public constructor(
        private readonly progress: vscode.Progress<{ message?: string; increment?: number }>,
        private readonly options?: Omit<ProgressReporterOptions, 'minIntervalMillis'>
    ) {
        this._totalBytes = options?.totalBytes
        if (this._totalBytes !== undefined) {
            if (!Number.isInteger(this._totalBytes)) {
                throw new TypeError(`totalBytes: ${this._totalBytes} must be an integer`)
            }
            if (this._totalBytes < 0) {
                throw new Error(`totalBytes ${this._totalBytes} cannot be negative`)
            }
        }
    }

    public get done(): boolean {
        return this._loadedBytes === this._totalBytes
    }

    private formatMessage(): string {
        const format = (b: number) => bytes(b, { unitSeparator: ' ', decimalPlaces: 0 })
        return this._totalBytes ? `${format(this._loadedBytes)} / ${format(this._totalBytes)}` : ''
    }

    /**
     * Reports the new progress (if any) and flushes the internal counter.
     */
    public report(): void {
        const message = this.options?.reportMessage ? this.formatMessage() : undefined
        this.progress.report({ message, increment: this._incrementalProgress })
        this._incrementalProgress = 0
        getLogger().verbose('%O', this)
    }

    /**
     * Returns the last incremental progress made in terms of percentage as an integer (rounded up).
     *
     * If the total bytes is undefined or 0, always returns 100%.
     */
    private incrementalPercentage(newBytes: number): number {
        return this._totalBytes ? (newBytes / this._totalBytes) * 100 : 100
    }

    /**
     * Returns the total progress made in terms of percentage as an integer (rounded up).
     *
     * If the total bytes is unknown, always returns undefined.
     * If the total bytes is 0, always returns 100%.
     */
    public get loadedPercentage(): number | undefined {
        switch (this._totalBytes) {
            case undefined:
                return undefined
            case 0:
                return 100
            default:
                return Math.ceil((this._loadedBytes / this._totalBytes) * 100)
        }
    }

    /**
     * Updates the cumulated bytes, signifying that additional progress has been made.
     *
     * @param newLoadedBytes the the new cumulative total bytes loaded.
     * This value must be greater than or equal to the previous cumulative bytes (progress cannot go backwards).
     *
     * @throws Error if newLoadedBytes is not an integer, exceeds the total bytes, or is negative.
     */
    public update(newBytes: number): void {
        if (!Number.isInteger(newBytes)) {
            throw new TypeError(`newBytes: ${newBytes} must be an integer`)
        } else if (newBytes < 0) {
            throw new Error(`newBytes: ${newBytes} cannot be negative`)
        } else if (this._totalBytes !== undefined && newBytes > this._totalBytes) {
            throw new Error(`newBytes: ${newBytes} cannot be greater than totalBytes`)
        }

        this._incrementalProgress += this.incrementalPercentage(newBytes)
        this._loadedBytes += newBytes
    }

    public [inspect.custom](): string {
        switch (this._totalBytes) {
            case undefined:
                return `ProgressReport: ${this._loadedBytes} bytes loaded)`
            default:
                return `ProgressReport: ${this._loadedBytes} / ${this._totalBytes} bytes loaded (${this.loadedPercentage}%)`
        }
    }
}
