/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before/After hooks for all "unit" tests
 */
import * as assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import { appendFileSync, mkdirpSync, remove } from 'fs-extra'
import { join } from 'path'
import { CodelensRootRegistry } from '../shared/sam/codelensRootRegistry'
import { CloudFormationTemplateRegistry } from '../shared/cloudformation/templateRegistry'
import { ext } from '../shared/extensionGlobals'
import { getLogger, LogLevel } from '../shared/logger'
import { setLogger } from '../shared/logger/logger'
import * as extWindow from '../shared/vscode/window'
import { DefaultTelemetryService } from '../shared/telemetry/defaultTelemetryService'
import { FakeExtensionContext } from './fakeExtensionContext'
import * as fakeTelemetry from './fake/fakeTelemetryService'
import { TestLogger } from './testLogger'
import { FakeAwsContext } from './utilities/fakeAwsContext'
import { initializeComputeRegion } from '../shared/extensionUtilities'
import { SchemaService } from '../shared/schemas'
import { deleteTestTempDirs } from './testUtil'

const testReportDir = join(__dirname, '../../../.test-reports')
const testLogOutput = join(testReportDir, 'testLog.log')

// Expectation: Tests are not run concurrently
let testLogger: TestLogger | undefined

before(async function () {
    patchFakeTimers()
    // Clean up and set up test logs
    try {
        await remove(testLogOutput)
    } catch (e) {}
    mkdirpSync(testReportDir)
    // Set up global telemetry client
    const fakeContext = new FakeExtensionContext()
    const fakeAws = new FakeAwsContext()
    const fakeTelemetryPublisher = new fakeTelemetry.FakeTelemetryPublisher()
    const service = new DefaultTelemetryService(fakeContext, fakeAws, undefined, fakeTelemetryPublisher)
    ext.init(fakeContext, extWindow.Window.vscode())
    ext.telemetry = service
    await initializeComputeRegion()
})

after(async function () {
    deleteTestTempDirs()
})

beforeEach(function () {
    // Set every test up so that TestLogger is the logger used by toolkit code
    testLogger = setupTestLogger()
    ext.templateRegistry = new CloudFormationTemplateRegistry()
    ext.codelensRootRegistry = new CodelensRootRegistry()
    ext.schemaService = new SchemaService(ext.context)
})

afterEach(function () {
    // Prevent other tests from using the same TestLogger instance
    teardownTestLogger(this.currentTest?.fullTitle() as string)
    testLogger = undefined
    ext.templateRegistry.dispose()
    ext.codelensRootRegistry.dispose()
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
    setLogger(logger, 'debugConsole')

    return logger
}

function teardownTestLogger(testName: string) {
    writeLogsToFile(testName)

    setLogger(undefined, 'main')
    setLogger(undefined, 'channel')
    setLogger(undefined, 'debugConsole')
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

/**
 * Patches `FakeTimers` to use the real `clearTimeout` in case there are any previous
 * timers prior to patching the clocks.
 *
 * Fixes #1233, #1281, #2189
 */
function patchFakeTimers() {
    const realClearTimeout = global.clearTimeout
    const install = FakeTimers.install
    Object.defineProperty(FakeTimers, 'install', {
        value: (config?: any) => {
            const clock = install(config)
            const fakeClearTimeout = global.clearTimeout

            const patchedClear = (arg: any) => {
                realClearTimeout(arg)
                fakeClearTimeout(arg)
            }
            // `clearTimeout` won't be restored if this field is missing (or false)
            // https://github.com/sinonjs/fake-timers/blob/679214eb0aa6702b65162608bb117b83f04947fe/src/fake-timers-src.js#L843
            Object.assign(patchedClear, { hadOwnProperty: true })
            global.clearTimeout = patchedClear

            return clock
        },
    })
}

describe('Global Setup', function () {
    it('patches `FakeTimers` to clear old timers', function () {
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('This should be cleared')), 1)
            setTimeout(resolve, 1)
            const clock = FakeTimers.install()
            clearTimeout(timer)
            clock.uninstall()
            assert.doesNotThrow(() => clearTimeout(0), 'Expected global timers to be restored')
        })
    })
})
