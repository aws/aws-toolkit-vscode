/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import {
    compareSamLambdaRuntime,
    getDependencyManager,
    getFamily,
    SamLambdaRuntime,
    samLambdaRuntimes
} from '../../../lambda/models/samLambdaRuntime'

describe('compareSamLambdaRuntime', async () => {
    const scenarios: {
        lowerRuntime: SamLambdaRuntime
        higherRuntime: SamLambdaRuntime
    }[] = [
        { lowerRuntime: 'nodejs8.10', higherRuntime: 'nodejs10.x' },
        { lowerRuntime: 'nodejs8.10', higherRuntime: 'nodejs12.x' },
        { lowerRuntime: 'nodejs10.x', higherRuntime: 'nodejs12.x' }
    ]

    scenarios.forEach(scenario => {
        it(`${scenario.lowerRuntime} < ${scenario.higherRuntime}`, () => {
            assert.ok(compareSamLambdaRuntime(scenario.lowerRuntime, scenario.higherRuntime) < 0)
        })

        it(`${scenario.higherRuntime} > ${scenario.lowerRuntime}`, () => {
            assert.ok(compareSamLambdaRuntime(scenario.higherRuntime, scenario.lowerRuntime) > 0)
        })
    })
})

describe('getDependencyManager', async () => {
    it('all runtimes are handled', async () => {
        samLambdaRuntimes.forEach(runtime => {
            // Checking that call does not throw
            getDependencyManager(runtime)
        })
    })
})

describe('getFamily', async () => {
    it('all runtimes are handled', async () => {
        samLambdaRuntimes.forEach(runtime => {
            // Checking that call does not throw
            getFamily(runtime)
        })
    })
})
