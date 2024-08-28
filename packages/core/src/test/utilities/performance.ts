/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Sinon from 'sinon'

export function stubPerformance(sandbox: Sinon.SinonSandbox) {
    const cpuUsage = { user: 10000, system: 2000 }
    const initialHeapTotal = 1
    const totalNanoseconds = 30000000 // 0.03 seconds

    sandbox.stub(process, 'cpuUsage').returns(cpuUsage)

    const memoryUsageStub = sandbox.stub(process, 'memoryUsage')
    memoryUsageStub
        .onCall(0)
        .returns({ heapTotal: initialHeapTotal, arrayBuffers: 0, external: 0, rss: 0, heapUsed: 0 })
    memoryUsageStub.onCall(1).returns({ heapTotal: 10485761, arrayBuffers: 0, external: 0, rss: 0, heapUsed: 0 })

    sandbox.stub(process, 'hrtime').returns([0, totalNanoseconds])

    return {
        expectedUserCpuUsage: 33.333333333333336,
        expectedSystemCpuUsage: 6.666666666666667,
        expectedHeapTotal: 10,
        expectedTotalSeconds: totalNanoseconds / 1e9,
    }
}
