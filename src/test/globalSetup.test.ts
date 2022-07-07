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
import { format } from 'util'
import { CloudFormationTemplateRegistry } from '../shared/cloudformation/templateRegistry'
import globals from '../shared/extensionGlobals'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { getLogger, LogLevel } from '../shared/logger'
import { setLogger } from '../shared/logger/logger'
import { CodelensRootRegistry } from '../shared/sam/codelensRootRegistry'
import { activateExtension } from '../shared/utilities/vsCodeUtils'
import { FakeExtensionContext, FakeMemento } from './fakeExtensionContext'
import { TestLogger } from './testLogger'
import * as testUtil from './testUtil'

const testReportDir = join(__dirname, '../../../.test-reports')
const testLogOutput = join(testReportDir, 'testLog.log')

// Expectation: Tests are not run concurrently
let testLogger: TestLogger | undefined

before(async function () {
    // Clean up and set up test logs
    try {
        await remove(testLogOutput)
    } catch (e) {}
    mkdirpSync(testReportDir)

    // Extension activation has many side-effects such as changing globals
    // For stability in tests we will wait until the extension has activated prior to injecting mocks
    const activationLogger = (msg: string, ...meta: any[]) => console.log(format(msg, ...meta))
    await activateExtension(VSCODE_EXTENSION_ID.awstoolkit, false, activationLogger)
    const fakeContext = await FakeExtensionContext.create()
    fakeContext.globalStorageUri = (await testUtil.createTestWorkspaceFolder('globalStoragePath')).uri
    fakeContext.extensionPath = globals.context.extensionPath
    Object.assign(globals, { context: fakeContext })
})

after(async function () {
    testUtil.deleteTestTempDirs()
})

beforeEach(async function () {
    // Set every test up so that TestLogger is the logger used by toolkit code
    testLogger = setupTestLogger()
    globals.templateRegistry = new CloudFormationTemplateRegistry()
    globals.codelensRootRegistry = new CodelensRootRegistry()

    // Enable telemetry features for tests. The metrics won't actually be posted.
    globals.telemetry.telemetryEnabled = true
    globals.telemetry.clearRecords()
    globals.telemetry.logger.clear()
    ;(globals.context as FakeExtensionContext).globalState = new FakeMemento()

    //Reset globalState to avoid tests messing eachother up.
    ;(globals.context as FakeExtensionContext).globalState = new FakeMemento()

    await testUtil.closeAllEditors()
})

afterEach(function () {
    // Prevent other tests from using the same TestLogger instance
    teardownTestLogger(this.currentTest?.fullTitle() as string)
    testLogger = undefined
    globals.templateRegistry.dispose()
    globals.codelensRootRegistry.dispose()
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
    appendFileSync(testLogOutput, entries?.join('\n') ?? '', 'utf8')
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
