/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before/After hooks for all "unit" tests
 */

import * as assert from 'assert'
import { getLogger } from '../shared/logger'
import { setupTestLogger, teardownTestLogger, TestLogger } from './testLogger'

let testLogger: TestLogger | undefined

beforeEach(async () => {
    testLogger = setupTestLogger()
})

afterEach(async () => {
    teardownTestLogger()
    testLogger = undefined
})

export function getTestLogger(): TestLogger {
    const logger = getLogger()
    assert.strictEqual(logger, testLogger, 'The expected test logger is not the current logger')
    assert.ok(testLogger, 'TestLogger was expected to exist')

    return testLogger!
}
