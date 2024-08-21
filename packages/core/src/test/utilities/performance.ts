/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Sinon from 'sinon'

export function stubPerformance(sandbox: Sinon.SinonSandbox) {
    const expectedCpuUsage = { user: 10000, system: 2000 }
    const initialHeapTotal = 1
    const totalNanoseconds = 30000000 // 0.03 seconds

    sandbox.stub(process, 'cpuUsage').returns(expectedCpuUsage)

    const memoryUsageStub = sandbox.stub(process, 'memoryUsage')
    memoryUsageStub
        .onCall(0)
        .returns({ heapTotal: initialHeapTotal, arrayBuffers: 0, external: 0, rss: 0, heapUsed: 0 })
    memoryUsageStub.onCall(1).returns({ heapTotal: 10485761, arrayBuffers: 0, external: 0, rss: 0, heapUsed: 0 })

    sandbox.stub(process, 'hrtime').onCall(0).returns([0, 0]).onCall(1).returns([0, totalNanoseconds])

    return {
        expectedCpuUsage: 40,
        expectedHeapTotal: 10,
        expectedTotalSeconds: totalNanoseconds / 1e9,
    }
}
