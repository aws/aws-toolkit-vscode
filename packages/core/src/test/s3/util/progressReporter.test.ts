/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { progressReporter } from '../../../s3/progressReporter'
import sinon from 'sinon'

describe('progressReporter', function () {
    let progress: vscode.Progress<{ message?: string; increment?: number }>

    beforeEach(function () {
        progress = {} as any as vscode.Progress<{ message?: string; increment?: number }>
    })

    it('does not round', function () {
        const stub = sinon.stub()
        progress.report = stub
        const reporter = progressReporter(progress, { totalBytes: 3, minIntervalMillis: 0 })

        reporter(1)
        assert(stub.firstCall.calledWithExactly({ message: undefined, increment: (1 / 3) * 100 }))

        reporter(2)
        assert(stub.secondCall.calledWithExactly({ message: undefined, increment: (2 / 3) * 100 }))
    })

    it('reports incremental percentage when total is provided', function () {
        const stub = sinon.stub()
        progress.report = stub
        const reporter = progressReporter(progress, { totalBytes: 16, minIntervalMillis: 0 })

        reporter(4)
        assert(stub.firstCall.calledWithExactly({ message: undefined, increment: 25 }))

        reporter(8)
        assert(stub.secondCall.calledWithExactly({ message: undefined, increment: 50 }))
    })

    it('reports a formatted message if `reportMessage` is set', function () {
        const stub = sinon.stub()
        progress.report = stub
        const reporter = progressReporter(progress, {
            totalBytes: 16,
            minIntervalMillis: 0,
            reportMessage: true,
        })

        reporter(4)
        assert(stub.firstCall.calledWithExactly({ message: `4 B / 16 B`, increment: 25 }))

        reporter(8)
        assert(stub.secondCall.calledWithExactly({ message: `12 B / 16 B`, increment: 50 }))
    })

    it('throttles progress updates when update frequency exceeds throttle interval', function () {
        const stub = sinon.stub()
        progress.report = stub
        const reporter = progressReporter(progress, {
            totalBytes: 16,
            minIntervalMillis: 99999,
        })

        reporter(4) // should fire as leading edge of interval (4/16 - 0/16 = 4/16 = +25%)
        assert(
            stub.firstCall.calledWithExactly({
                message: undefined,
                increment: 25,
            })
        )

        reporter(4) // shouldn't fire
        reporter(8) // should fire, since this puts progress at 100%

        assert(
            stub.secondCall.calledWithExactly({
                message: undefined,
                increment: 75,
            })
        )
    })

    it('reports no incremental percentage when total is not provided', function () {
        const stub = sinon.stub()
        progress.report = stub
        const reporter = progressReporter(progress, { minIntervalMillis: 0 })

        reporter(4)
        reporter(8)

        assert(stub.calledTwice)
        assert(stub.firstCall.notCalledWith(sinon.match.number))
        assert(stub.secondCall.notCalledWith(sinon.match.number))
    })

    it('throws an error if total bytes is not an integer', function () {
        assert.throws(() => progressReporter(progress, { totalBytes: 1.5, minIntervalMillis: 0 }), /must be an integer/)
    })

    it('throws an error if total bytes is negative', function () {
        assert.throws(() => progressReporter(progress, { totalBytes: -5, minIntervalMillis: 0 }), /cannot be negative/)
    })

    it('throws an error if updated with non integer bytes', function () {
        const reporter = progressReporter(progress, { totalBytes: 5, minIntervalMillis: 0 })

        assert.throws(() => reporter(1.5), /must be an integer/)
    })

    it('throws an error if updated with negative bytes', function () {
        const reporter = progressReporter(progress, { totalBytes: 5, minIntervalMillis: 0 })

        assert.throws(() => reporter(-5), /cannot be negative/)
    })

    it('throws an error if updated with bytes greater than total bytes', function () {
        const reporter = progressReporter(progress, { totalBytes: 2, minIntervalMillis: 0 })

        assert.throws(() => reporter(5), /cannot be greater than totalBytes/)
    })
})
