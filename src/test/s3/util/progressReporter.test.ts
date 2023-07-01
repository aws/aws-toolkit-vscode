/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { progressReporter } from '../../../s3/progressReporter'
import { deepEqual, mock, verify, anyNumber, instance } from '../../utilities/mockito'

describe('progressReporter', function () {
    let progress: vscode.Progress<{ message?: string; increment?: number }>

    beforeEach(function () {
        progress = mock()
    })

    it('does not round', function () {
        const reporter = progressReporter(instance(progress), { totalBytes: 3, minIntervalMillis: 0 })

        reporter(1)
        verify(progress.report(deepEqual({ message: undefined, increment: (1 / 3) * 100 }))).once()

        reporter(2)
        verify(progress.report(deepEqual({ message: undefined, increment: (2 / 3) * 100 }))).once()
    })

    it('reports incremental percentage when total is provided', function () {
        const reporter = progressReporter(instance(progress), { totalBytes: 16, minIntervalMillis: 0 })

        reporter(4)
        verify(progress.report(deepEqual({ message: undefined, increment: 25 }))).once()

        reporter(8)
        verify(progress.report(deepEqual({ message: undefined, increment: 50 }))).once()
    })

    it('reports a formatted message if `reportMessage` is set', function () {
        const reporter = progressReporter(instance(progress), {
            totalBytes: 16,
            minIntervalMillis: 0,
            reportMessage: true,
        })

        reporter(4)
        verify(progress.report(deepEqual({ message: `4 B / 16 B`, increment: 25 }))).once()

        reporter(8)
        verify(progress.report(deepEqual({ message: `12 B / 16 B`, increment: 50 }))).once()
    })

    it('throttles progress updates when update frequency exceeds throttle interval', function () {
        const reporter = progressReporter(instance(progress), {
            totalBytes: 16,
            minIntervalMillis: 99999,
        })

        reporter(4) // should fire as leading edge of interval (4/16 - 0/16 = 4/16 = +25%)
        verify(
            progress.report(
                deepEqual({
                    message: undefined,
                    increment: 25,
                })
            )
        ).once()

        reporter(4) // shouldn't fire
        reporter(8) // should fire, since this puts progress at 100%

        verify(
            progress.report(
                deepEqual({
                    message: undefined,
                    increment: 75,
                })
            )
        ).once()
    })

    it('reports no incremental percentage when total is not provided', function () {
        const reporter = progressReporter(instance(progress), { minIntervalMillis: 0 })

        reporter(4)
        reporter(8)
        verify(progress.report(anyNumber())).never()
    })

    it('throws an error if total bytes is not an integer', function () {
        assert.throws(
            () => progressReporter(instance(progress), { totalBytes: 1.5, minIntervalMillis: 0 }),
            /must be an integer/
        )
    })

    it('throws an error if total bytes is negative', function () {
        assert.throws(
            () => progressReporter(instance(progress), { totalBytes: -5, minIntervalMillis: 0 }),
            /cannot be negative/
        )
    })

    it('throws an error if updated with non integer bytes', function () {
        const reporter = progressReporter(instance(progress), { totalBytes: 5, minIntervalMillis: 0 })

        assert.throws(() => reporter(1.5), /must be an integer/)
    })

    it('throws an error if updated with negative bytes', function () {
        const reporter = progressReporter(instance(progress), { totalBytes: 5, minIntervalMillis: 0 })

        assert.throws(() => reporter(-5), /cannot be negative/)
    })

    it('throws an error if updated with bytes greater than total bytes', function () {
        const reporter = progressReporter(instance(progress), { totalBytes: 2, minIntervalMillis: 0 })

        assert.throws(() => reporter(5), /cannot be greater than totalBytes/)
    })
})
