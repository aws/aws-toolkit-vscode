/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { PerformanceTracker } from '../../../shared/performance/performance'
import { stubPerformance } from '../../utilities/performance'

describe('performance tooling', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('PerformanceTracker', () => {
        it('gets performance metrics', () => {
            const { expectedUserCpuUsage, expectedSystemCpuUsage, expectedHeapTotal, expectedTotalSeconds } =
                stubPerformance(sandbox)
            const perf = new PerformanceTracker('foo')
            perf.start()
            const metrics = perf.stop()

            assert.deepStrictEqual(metrics?.userCpuUsage, expectedUserCpuUsage)
            assert.deepStrictEqual(metrics?.systemCpuUsage, expectedSystemCpuUsage)
            assert.deepStrictEqual(metrics?.heapTotal, expectedHeapTotal)
            assert.deepStrictEqual(metrics?.duration, expectedTotalSeconds)
        })
    })
})
