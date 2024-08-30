/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Sinon from 'sinon'

export function stubPerformance(sandbox: Sinon.SinonSandbox) {
    const totalNanoseconds = 30000000 // 0.03 seconds

    sandbox.stub(process, 'hrtime').returns([0, totalNanoseconds])

    return {
        expectedTotalSeconds: totalNanoseconds / 1e9,
    }
}
