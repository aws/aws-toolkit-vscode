/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before/After hooks for all "unit" tests
 */
import assert from 'assert'
import * as sinon from 'sinon'
import vscode from 'vscode'
import { appendFileSync, mkdirpSync, remove } from 'fs-extra'
import { join } from 'path'
import { format } from 'util'
import globals from '../shared/extensionGlobals'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { CodelensRootRegistry } from '../shared/fs/codelensRootRegistry'
import { CloudFormationTemplateRegistry } from '../shared/fs/templateRegistry'
import { getLogger, LogLevel } from '../shared/logger'
import { setLogger } from '../shared/logger/logger'
import { activateExtension } from '../shared/utilities/vsCodeUtils'
import { FakeExtensionContext, FakeMemento } from './fakeExtensionContext'
import { TestLogger } from './testLogger'
import * as testUtil from './testUtil'
import { getTestWindow, resetTestWindow } from './shared/vscode/window'
import { mapTestErrors, normalizeError, setRunnableTimeout } from './setupUtil'
import { TelemetryDebounceInfo } from '../shared/vscode/commands2'
import { disableAwsSdkWarning } from '../shared/awsClientBuilder'

disableAwsSdkWarning()

const testReportDir = join(__dirname, '../../../../../.test-reports') // Root project, not subproject
const testLogOutput = join(testReportDir, 'testLog.log')
const globalSandbox = sinon.createSandbox()
const maxTestDuration = 30_000

// Expectation: Tests are not run concurrently
let testLogger: TestLogger | undefined
let openExternalStub: sinon.SinonStub<Parameters<(typeof vscode)['env']['openExternal']>, Thenable<boolean>>
// let executeCommandSpy: sinon.SinonSpy | undefined

export async function mochaGlobalSetup(this: Mocha.Runner) {
    // Clean up and set up test logs
    try {
        await remove(testLogOutput)
    } catch (e) {}
    mkdirpSync(testReportDir)

    // Shows the full error chain when tests fail
    mapTestErrors(this, normalizeError)

    // Extension activation has many side-effects such as changing globals
    // For stability in tests we will wait until the extension has activated prior to injecting mocks
    const activationLogger = (msg: string, ...meta: any[]) => console.log(format(msg, ...meta))
    await activateExtension(VSCODE_EXTENSION_ID.awstoolkit, false, activationLogger)
    const fakeContext = await FakeExtensionContext.create()
    fakeContext.globalStorageUri = (await testUtil.createTestWorkspaceFolder('globalStoragePath')).uri
    fakeContext.extensionPath = globals.context.extensionPath
    Object.assign(globals, { context: fakeContext })
}

export async function mochaGlobalTeardown(this: Mocha.Context) {
    await testUtil.deleteTestTempDirs()
}

export const mochaHooks = {
    async beforeEach(this: Mocha.Context) {
        // Set every test up so that TestLogger is the logger used by toolkit code
        testLogger = setupTestLogger()
        globals.templateRegistry = (async () => new CloudFormationTemplateRegistry())()
        globals.codelensRootRegistry = new CodelensRootRegistry()

        // In general, we do not want to "fake" the `vscode` API. The only exception is for things
        // that _require_ user input apart of a workflow. Even then, these replacements are intended
        // to be minimally intrusive and as close to the real thing as possible.
        globalSandbox.replace(vscode, 'window', getTestWindow())
        openExternalStub = globalSandbox.stub(vscode.env, 'openExternal')
        openExternalStub.returns(undefined as any) // Detected in afterEach() below.

        // Wraps the test function to bubble up errors that occurred in events from `TestWindow`
        if (this.currentTest?.fn) {
            setRunnableTimeout(this.currentTest, maxTestDuration)
        }

        // Enable telemetry features for tests. The metrics won't actually be posted.
        globals.telemetry.telemetryEnabled = true
        globals.telemetry.clearRecords()
        globals.telemetry.logger.clear()
        TelemetryDebounceInfo.instance.clear()
        ;(globals.context as FakeExtensionContext).globalState = new FakeMemento()

        await testUtil.closeAllEditors()
    },
    async afterEach(this: Mocha.Context) {
        if (openExternalStub.called && openExternalStub.returned(sinon.match.typeOf('undefined'))) {
            throw new Error(
                `Test called openExternal(${
                    getOpenExternalStub().args[0]
                }) without first configuring getOpenExternalStub().resolves().`
            )
        }

        // Prevent other tests from using the same TestLogger instance
        teardownTestLogger(this.currentTest?.fullTitle() as string)
        testLogger = undefined
        resetTestWindow()
        const r = await globals.templateRegistry
        r.dispose()
        globals.codelensRootRegistry.dispose()
        globalSandbox.restore()

        // executeCommandSpy = undefined
    },
}

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

export function getOpenExternalStub(): typeof openExternalStub {
    return openExternalStub
}

// /**
//  * Returns a spy for `vscode.commands.executeCommand()`.
//  *
//  * Opt-in per test, because most tests should test application state instead of spies.
//  * Global `afterEach` automatically calls `globalSandbox.restore()` after the test run.
//  */
// export function stubVscodeExecuteCommand() {
//     executeCommandSpy = executeCommandSpy ?? globalSandbox.spy(vscode.commands, 'executeCommand')
//     return executeCommandSpy
// }
