/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { inspect } from 'util'
import { throttle } from 'lodash'

const DEFAULT_REPORTING_INTERVAL_MILLIS = 500

/**
 * Returns a function that pipes cumulative byte progress to VSCode's incremental percentage Progress.
 *
 * @param progress the VSCode progress to update.
 * @param totalBytes the total bytes.
 * Used in combination with cumulative bytes to calculate incremental progress.
 * @param minIntervalMillis the minimum delay between progress updates.
 * Used to throttle updates. Updates that occur between intervals are dropped.
 */
export function progressReporter({
    progress,
    totalBytes,
    minIntervalMillis = DEFAULT_REPORTING_INTERVAL_MILLIS,
}: {
    progress: vscode.Progress<{ message?: string; increment?: number }>
    totalBytes?: number
    minIntervalMillis?: number
}): (loadedBytes: number) => void {
    const reportProgressThrottled = throttle(reportProgressImmediately, minIntervalMillis, {
        leading: true,
        trailing: false,
    })

    const report = new ProgressReport(totalBytes)
    return loadedBytes => {
        const isDone = loadedBytes === totalBytes
        if (isDone) {
            reportProgressImmediately(progress, report, loadedBytes)
        } else {
            reportProgressThrottled(progress, report, loadedBytes)
        }
    }
}

/**
 * Throttles the given function unless the given condition is met by the arguments.
 *
 * Like _.throttle except specific calls can bypass the throttling.
 */
function reportProgressImmediately(
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    report: ProgressReport,
    loadedBytes: number
): void {
    report.updateLoadedBytes(loadedBytes)
    if (report.incrementalPercentage) {
        progress.report({ increment: report.incrementalPercentage })
    }
    getLogger().verbose('%O', report)
}

/**
 * Tracks incremental and total progress in terms of bytes and percentages.
 */
class ProgressReport {
    private _incrementalBytes = 0
    private _loadedBytes = 0

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
    public constructor(private readonly _totalBytes?: number) {
        if (_totalBytes !== undefined) {
            if (!Number.isInteger(_totalBytes)) {
                throw new Error(`totalBytes: ${_totalBytes} must be an integer`)
            }
            if (_totalBytes < 0) {
                throw new Error(`totalBytes ${_totalBytes} cannot be negative`)
            }
        }
    }

    public get loadedBytes(): number {
        return this._loadedBytes
    }

    public get totalBytes(): number | undefined {
        return this._totalBytes
    }

    /**
     * Returns the last incremental progress made in terms of percentage as an integer (rounded up).
     *
     * If the total bytes is unknown, always returns undefined.
     * If the total bytes is 0, always returns 100%.
     */
    public get incrementalPercentage(): number | undefined {
        switch (this._totalBytes) {
            case undefined:
                return undefined
            case 0:
                return 100
            default:
                return Math.ceil((this._incrementalBytes / this._totalBytes) * 100)
        }
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
     * @throws Error if newLoadedBytes is not an integer, exceeds the total bytes, causes a decrease in progress, or is negative.
     */
    public updateLoadedBytes(newLoadedBytes: number): void {
        if (!Number.isInteger(newLoadedBytes)) {
            throw new Error(`newLoadedBytes: ${newLoadedBytes} must be an integer`)
        } else if (newLoadedBytes < 0) {
            throw new Error(`newLoadedBytes: ${newLoadedBytes} cannot be negative`)
        } else if (this.totalBytes !== undefined && newLoadedBytes > this.totalBytes) {
            throw new Error(`newLoadedBytes: ${newLoadedBytes} cannot be greater than totalBytes`)
        } else if (newLoadedBytes < this._loadedBytes) {
            throw new Error(`newLoadedBytes: ${newLoadedBytes} cannot be less than loadedBytes: ${this._loadedBytes}`)
        }

        this._incrementalBytes = newLoadedBytes - this._loadedBytes
        this._loadedBytes = newLoadedBytes
    }

    public [inspect.custom](): string {
        switch (this.totalBytes) {
            case undefined:
                return `ProgressReport: ${this.loadedBytes} bytes loaded)`
            default:
                return `ProgressReport: ${this.loadedBytes} / ${this.totalBytes} bytes loaded (${this.loadedPercentage}%)`
        }
    }
}
