/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before/After hooks for all "unit" tests
 */
import * as assert from 'assert'
import { appendFileSync, mkdirpSync } from 'fs-extra'
import { join } from 'path'
import { ext } from '../shared/extensionGlobals'
import { rmrf } from '../shared/filesystem'
import { getLogger } from '../shared/logger'
import { setLogger } from '../shared/logger/logger'
import { DefaultTelemetryService } from '../shared/telemetry/defaultTelemetryService'
import { TelemetryFeedback } from '../shared/telemetry/telemetryFeedback'
import { TelemetryPublisher } from '../shared/telemetry/telemetryPublisher'
import { FakeExtensionContext } from './fakeExtensionContext'
import { TestLogger } from './testLogger'
import { FakeAwsContext } from './utilities/fakeAwsContext'

const testReportDir = join(__dirname, '../../../.test-reports')
const testLogOutput = join(testReportDir, 'testLog.log')

// Expectation: Tests are not run concurrently
let testLogger: TestLogger | undefined

before(async () => {
    // Clean up and set up test logs
    try {
        await rmrf(testLogOutput)
    } catch (e) {}
    mkdirpSync(testReportDir)
    // Set up global telemetry client
    const mockContext = new FakeExtensionContext()
    const mockAws = new FakeAwsContext()
    const mockPublisher: TelemetryPublisher = {
        async init() {},
        async postFeedback(feedback: TelemetryFeedback): Promise<void> {},
        enqueue(...events: any[]) {},
        async flush() {},
    }
    const service = new DefaultTelemetryService(mockContext, mockAws, mockPublisher)
    ext.telemetry = service
})

beforeEach(async function() {
    // Set every test up so that TestLogger is the logger used by toolkit code
    testLogger = setupTestLogger()
})

afterEach(async function() {
    // Prevent other tests from using the same TestLogger instance
    // tslint:disable-next-line: no-unsafe-any, no-invalid-this
    teardownTestLogger(this.currentTest?.fullTitle() as string)
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

function teardownTestLogger(testName: string) {
    writeLogsToFile(testName)
    setLogger(undefined)
}

function writeLogsToFile(testName: string) {
    const entries = testLogger?.getLoggedEntries()
    entries?.unshift(`=== Starting test "${testName}" ===`)
    entries?.push(`=== Ending test "${testName}" ===\n\n`)
    appendFileSync(testLogOutput, entries?.join('\n'), 'utf8')
}
