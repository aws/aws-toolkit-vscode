/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as sinon from 'sinon'
import { performanceTest } from '../../shared/performance/performance'

describe('zipCode', function () {
    describe('performance tests', function () {
        performanceTest({}, 'many small files in zip', function () {
            return {
                setup: async () => {},
                execute: async () => {},
                verify: async () => {},
            }
        })
    })
})
