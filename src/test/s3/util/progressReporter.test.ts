/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { progressReporter } from '../../../s3/util/progressReporter'
import { deepEqual, mock, verify, anyNumber, instance } from '../../utilities/mockito'

describe('progressReporter', () => {
    let progress: vscode.Progress<{ message?: string; increment?: number }>

    beforeEach(() => {
        progress = mock()
    })

    it('reports incremental percentage when total is provided', () => {
        const reporter = progressReporter(instance(progress), 16)

        reporter(4)
        verify(progress.report(deepEqual({ increment: 25 }))).once()

        reporter(12)
        verify(progress.report(deepEqual({ increment: 50 }))).once()
    })

    it('reports no incremental percentage when total is not provided', () => {
        const reporter = progressReporter(progress)

        reporter(4)
        reporter(8)
        verify(progress.report(anyNumber())).never()
    })

    it('throws an error if total bytes is not an integer', () => {
        assert.throws(() => progressReporter(progress, 1.5), /must be an integer/)
    })

    it('throws an error if total bytes is negative', () => {
        assert.throws(() => progressReporter(progress, -5), /cannot be negative/)
    })

    it('throws an error if updated with bytes less than loaded bytes', () => {
        const reporter = progressReporter(progress, 16)

        reporter(4)

        assert.throws(() => reporter(2), /cannot be less than loadedBytes/)
    })

    it('throws an error if updated with non integer bytes', () => {
        const reporter = progressReporter(progress, 5)

        assert.throws(() => reporter(1.5), /must be an integer/)
    })

    it('throws an error if updated with negative bytes', () => {
        const reporter = progressReporter(progress, 5)

        assert.throws(() => reporter(-5), /cannot be negative/)
    })

    it('throws an error if updated with positive bytes when total bytes is 0', () => {
        const reporter = progressReporter(progress, 0)

        assert.throws(() => reporter(5), /cannot be positive when totalBytes is 0/)
    })
})
