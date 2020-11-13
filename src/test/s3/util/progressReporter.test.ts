/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { progressReporter } from '../../../s3/progressReporter'
import { deepEqual, mock, verify, anyNumber, instance } from '../../utilities/mockito'

describe('progressReporter', () => {
    let progress: vscode.Progress<{ message?: string; increment?: number }>

    beforeEach(() => {
        progress = mock()
    })

    it('reports incremental percentage when total is provided', () => {
        const reporter = progressReporter({ progress: instance(progress), totalBytes: 16, minIntervalMillis: 0 })

        reporter(4)
        verify(progress.report(deepEqual({ increment: 25 }))).once()

        reporter(12)
        verify(progress.report(deepEqual({ increment: 50 }))).once()
    })

    it('throttles progress updates when update frequency exceeds throttle interval', () => {
        const reporter = progressReporter({
            progress: instance(progress),
            totalBytes: 16,
            minIntervalMillis: 99999,
        })

        reporter(4) // should fire as leading edge of interval (4/16 - 0/16 = 4/16 = +25%)
        verify(
            progress.report(
                deepEqual({
                    increment: 25,
                })
            )
        ).once()

        reporter(5) // shouldn't fire
        reporter(12) // shouldn't fire
        reporter(14) // shouldn't fire
        reporter(16) // should fire, since this puts progress at 100% (16/16 - 4/16 = 12/16 = +75%)

        verify(
            progress.report(
                deepEqual({
                    increment: 75,
                })
            )
        ).once()
    })

    it('reports no incremental percentage when total is not provided', () => {
        const reporter = progressReporter({ progress: instance(progress), minIntervalMillis: 0 })

        reporter(4)
        reporter(8)
        verify(progress.report(anyNumber())).never()
    })

    it('throws an error if total bytes is not an integer', () => {
        assert.throws(
            () => progressReporter({ progress: instance(progress), totalBytes: 1.5, minIntervalMillis: 0 }),
            /must be an integer/
        )
    })

    it('throws an error if total bytes is negative', () => {
        assert.throws(
            () => progressReporter({ progress: instance(progress), totalBytes: -5, minIntervalMillis: 0 }),
            /cannot be negative/
        )
    })

    it('throws an error if updated with bytes less than loaded bytes', () => {
        const reporter = progressReporter({ progress: instance(progress), totalBytes: 16, minIntervalMillis: 0 })

        reporter(4)

        assert.throws(() => reporter(2), /cannot be less than loadedBytes/)
    })

    it('throws an error if updated with non integer bytes', () => {
        const reporter = progressReporter({ progress: instance(progress), totalBytes: 5, minIntervalMillis: 0 })

        assert.throws(() => reporter(1.5), /must be an integer/)
    })

    it('throws an error if updated with negative bytes', () => {
        const reporter = progressReporter({ progress: instance(progress), totalBytes: 5, minIntervalMillis: 0 })

        assert.throws(() => reporter(-5), /cannot be negative/)
    })

    it('throws an error if updated with bytes greater than total bytes', () => {
        const reporter = progressReporter({ progress: instance(progress), totalBytes: 2, minIntervalMillis: 0 })

        assert.throws(() => reporter(5), /cannot be greater than totalBytes/)
    })
})
