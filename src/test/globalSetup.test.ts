/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before/After hooks for all "unit" tests
 */

import * as assert from 'assert'
import { ext } from '../shared/extensionGlobals'
import { getLogger } from '../shared/logger'
import { setLogger } from '../shared/logger/logger'
import { DefaultTelemetryService } from '../shared/telemetry/defaultTelemetryService'
import { TelemetryPublisher } from '../shared/telemetry/telemetryPublisher'
import { FakeExtensionContext } from './fakeExtensionContext'
import { TestLogger } from './testLogger'
import { FakeAwsContext } from './utilities/fakeAwsContext'

// Expectation: Tests are not run concurrently
let testLogger: TestLogger | undefined

// Set up global telemetry client
before(async () => {
    const mockContext = new FakeExtensionContext()
    const mockAws = new FakeAwsContext()
    const mockPublisher: TelemetryPublisher = {
        async init() {},
        enqueue(...events: any[]) {},
        async flush() {}
    }
    const service = new DefaultTelemetryService(mockContext, mockAws, mockPublisher)
    ext.telemetry = service
})

beforeEach(async () => {
    // Set every test up so that TestLogger is the logger used by toolkit code
    testLogger = setupTestLogger()
})

afterEach(async () => {
    // Prevent other tests from using the same TestLogger instance
    teardownTestLogger()
    testLogger = undefined
})

/**
 * Provides the TestLogger to tests that want to access it.
 * Verifies that the TestLogger instance is still the one set as the toolkit's logger.
 */
export function getTestLogger(): TestLogger {
    const logger = getLogger()
    assert.strictEqual(logger, testLogger, 'The expected test logger is not the current logger')
    assert.ok(testLogger, 'TestLogger was expected to exist')

    return testLogger!
}

function setupTestLogger(): TestLogger {
    const logger = new TestLogger()
    setLogger(logger)

    return logger
}

function teardownTestLogger() {
    setLogger(undefined)
}
