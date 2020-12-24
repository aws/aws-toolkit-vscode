/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before/After hooks for all "unit" tests
 */
import * as assert from 'assert'
import { appendFileSync, mkdirpSync, remove } from 'fs-extra'
import { join } from 'path'
import { CodelensRootRegistry } from '../shared/sam/codelensRootRegistry'
import { CloudFormationTemplateRegistry } from '../shared/cloudformation/templateRegistry'
import { ext } from '../shared/extensionGlobals'
import { getLogger, LogLevel } from '../shared/logger'
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
        await remove(testLogOutput)
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
    const service = new DefaultTelemetryService(mockContext, mockAws, undefined, mockPublisher)
    ext.telemetry = service
    ext.templateRegistry = new CloudFormationTemplateRegistry()
    ext.codelensRootRegistry = new CodelensRootRegistry()
})

beforeEach(async function () {
    // Set every test up so that TestLogger is the logger used by toolkit code
    testLogger = setupTestLogger()
})

afterEach(async function () {
    // Prevent other tests from using the same TestLogger instance
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

    return logger!
}

function setupTestLogger(): TestLogger {
    // write the same logger to each channel.
    // That way, we don't have to worry about which channel is being logged to for inspection.
    const logger = new TestLogger()
    setLogger(logger, 'main')
    setLogger(logger, 'channel')
    setLogger(logger, 'debug')

    return logger
}

function teardownTestLogger(testName: string) {
    writeLogsToFile(testName)

    setLogger(undefined, 'main')
    setLogger(undefined, 'channel')
    setLogger(undefined, 'debug')
}

function writeLogsToFile(testName: string) {
    const entries = testLogger?.getLoggedEntries()
    entries?.unshift(`=== Starting test "${testName}" ===`)
    entries?.push(`=== Ending test "${testName}" ===\n\n`)
    appendFileSync(testLogOutput, entries?.join('\n'), 'utf8')
}

export function assertLogsContain(text: string, exactMatch: boolean, severity: LogLevel) {
    assert.ok(
        getTestLogger()
            .getLoggedEntries(severity)
            .some(e =>
                e instanceof Error
                    ? exactMatch
                        ? e.message === text
                        : e.message.includes(text)
                    : exactMatch
                    ? e === text
                    : e.includes(text)
            ),
        `Expected to find "${text}" in the logs as type "${severity}"`
    )
}
