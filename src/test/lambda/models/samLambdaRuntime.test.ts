/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Runtime } from 'aws-sdk/clients/lambda'
import {
    compareSamLambdaRuntime,
    getDependencyManager,
    getFamily,
    samZipLambdaRuntimes,
    RuntimeFamily,
} from '../../../lambda/models/samLambdaRuntime'

describe('compareSamLambdaRuntime', async function() {
    const scenarios: {
        lowerRuntime: Runtime
        higherRuntime: Runtime
    }[] = [
        { lowerRuntime: 'nodejs12.x', higherRuntime: 'nodejs14.x' },
        { lowerRuntime: 'nodejs10.x', higherRuntime: 'nodejs12.x' },
        { lowerRuntime: 'nodejs10.x', higherRuntime: 'nodejs14.x' },
        { lowerRuntime: 'nodejs10.x', higherRuntime: 'nodejs10.x (Image)' },
        { lowerRuntime: 'nodejs10.x (Image)', higherRuntime: 'nodejs12.x' },
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

describe('getDependencyManager', async function() {
    it('all runtimes are handled', async function() {
        samZipLambdaRuntimes.forEach(runtime => {
            // Checking that call does not throw
            getDependencyManager(runtime)
        })
    })
})

describe('getFamily', async function() {
    it('unknown runtime name', async function() {
        assert.strictEqual(getFamily('foo'), RuntimeFamily.Unknown)
    })
    it('handles all known runtimes', async function() {
        samZipLambdaRuntimes.forEach(runtime => {
            assert.notStrictEqual(getFamily(runtime), RuntimeFamily.Unknown)
        })
    })
})
