/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { assertTelemetry, getMetrics, partialDeepCompare, TestFolder } from '../testUtil'
import assert from 'assert'
import globals from '../../shared/extensionGlobals'
import { CrashMonitoring, ExtInstance, crashMonitoringStateFactory } from '../../shared/crashMonitoring'
import { isCI } from '../../shared/vscode/env'
import { getLogger } from '../../shared/logger/logger'
import { SinonSandbox, createSandbox } from 'sinon'
import { fs, randomUUID } from '../../shared'
import path from 'path'

class TestCrashMonitoring extends CrashMonitoring {
    public constructor(...deps: ConstructorParameters<typeof CrashMonitoring>) {
        super(...deps)
    }
    /** Imitates an extension crash */
    public async crash() {
        this.crashChecker.testCrash()
        this.heartbeat.testCrash()
    }

    public getTimeLag() {
        return this.crashChecker.timeLag
    }
}

export const crashMonitoringTest = async () => {
    let testFolder: TestFolder
    let spawnedExtensions: TestCrashMonitoring[]
    let sandbox: SinonSandbox

    // Scale down the default interval we heartbeat and check for crashes to something much short for testing.
    const checkInterval = 200

    // Add some buffer since after 1 interval the work is actually done, including file i/o which may be slow.
    // **IF FLAKY**, see if increasing the buffer helps.
    const oneInterval = checkInterval + 1000

    /**
     * Makes N "extension instances" that can be used for testing.
     * Each instances is actually the Crash Reporting instance, but there is a
     * 1:1 mapping between Crash Reporting instances and the Extension instances.
     */
    async function makeTestExtensions(amount: number) {
        const extensions: TestExtension[] = []
        for (let i = 0; i < amount; i++) {
            extensions[i] = await makeTestExtension(i)
        }
        return extensions
    }

    async function makeTestExtension(id: number, opts?: { isStateStale: () => Promise<boolean> }) {
        const isStateStale = opts?.isStateStale ?? (() => Promise.resolve(false))
        const sessionId = randomUUID()

        const state = await crashMonitoringStateFactory({
            workDirPath: testFolder.path,
            isStateStale,
            sessionId: sessionId,
            now: () => globals.clock.Date.now(),
            memento: globals.globalState,
            isDevMode: true,
            devLogger: getLogger(),
        })
        const ext = new TestCrashMonitoring(state, checkInterval, true, false, getLogger())
        spawnedExtensions.push(ext)
        const metadata = {
            sessionId,
            lastHeartbeat: globals.clock.Date.now(),
            isDebug: undefined,
        }
        return { ext, metadata }
    }

    beforeEach(async function () {
        testFolder = await TestFolder.create()
        spawnedExtensions = []
        sandbox = createSandbox()
    })

    afterEach(async function () {
        // clean up all running instances
        spawnedExtensions?.forEach((e) => e.crash())
        sandbox.restore()
    })

    it('graceful shutdown no metric emitted', async function () {
        const exts = await makeTestExtensions(2)

        await exts[0].ext.start()
        await awaitIntervals(oneInterval) // allow time to become primary checker
        // There is no other active instance to report the issue
        assertTelemetry('session_end', [])

        // Ext 1 does a graceful shutdown
        await exts[1].ext.start()
        await exts[1].ext.shutdown()
        await awaitIntervals(oneInterval)
        // Ext 1 did a graceful shutdown so no metric emitted
        assertTelemetry('session_end', [])
    })

    it('single running instance crashes, so nothing is reported, but a new instaces appears and reports', async function () {
        const exts = await makeTestExtensions(2)

        await exts[0].ext.start()
        await exts[0].ext.crash()
        await awaitIntervals(oneInterval)
        // There is no other active instance to report the issue
        assertTelemetry('session_end', [])

        await exts[1].ext.start()
        await awaitIntervals(oneInterval)
        // Starting a new instance will detect the previously crashed one
        assertCrashedExtensions([exts[0]])
    })

    it('multiple running instances start+crash at different times, but another instance always reports', async function () {
        const latestCrashedExts: TestExtension[] = []

        const exts = await makeTestExtensions(4)

        await exts[0].ext.start()
        await awaitIntervals(oneInterval)

        // start Ext 1 then crash it, Ext 0 finds the crash
        await exts[1].ext.start()
        await exts[1].ext.crash()
        latestCrashedExts.push(exts[1])
        await awaitIntervals(oneInterval * 1)

        assertCrashedExtensions(latestCrashedExts)

        // start Ext 2 and crash Ext 0, Ext 2 is promoted to Primary checker
        await exts[2].ext.start()
        await exts[0].ext.crash()
        latestCrashedExts.push(exts[0])
        await awaitIntervals(oneInterval * 1)
        assertCrashedExtensions(latestCrashedExts)

        // Ext 3 starts, then crashes. Ext 2 reports the crash since it is the Primary checker
        await exts[3].ext.start()
        await exts[3].ext.crash()
        latestCrashedExts.push(exts[3])
        await awaitIntervals(oneInterval * 1)
        assertCrashedExtensions(latestCrashedExts)
    })

    it('clears the state when a new os session is determined', async function () {
        const exts = await makeTestExtensions(1)

        // Start an extension then crash it
        await exts[0].ext.start()
        await exts[0].ext.crash()
        await awaitIntervals(oneInterval)
        // There is no other active instance to report the issue
        assertTelemetry('session_end', [])

        // This extension clears the state due to it being stale, not reporting the previously crashed ext
        const ext1 = await makeTestExtension(1, { isStateStale: () => Promise.resolve(true) })
        await ext1.ext.start()
        await awaitIntervals(oneInterval * 1)
        assertCrashedExtensions([])
    })

    it('start the first extension, then start many subsequent ones and crash them all at once', async function () {
        const latestCrashedExts: TestExtension[] = []

        const extCount = 10
        const exts = await makeTestExtensions(extCount)
        for (let i = 0; i < extCount; i++) {
            await exts[i].ext.start()
        }

        // Crash all exts except the 0th one
        for (let i = 1; i < extCount; i++) {
            await exts[i].ext.crash()
            latestCrashedExts.push(exts[i])
        }

        // Give some extra time since there is a lot of file i/o
        await awaitIntervals(oneInterval * 3)

        assertCrashedExtensions(latestCrashedExts)
    })

    it('does not check for crashes when there is a time lag', async function () {
        // This test handles the case for a users computer doing a sleep+wake and
        // then a crash was incorrectly reported since a new heartbeat could not be sent in time

        // Load up a crash
        const ext0 = await makeTestExtension(0)
        await ext0.ext.start()
        await ext0.ext.crash()

        const ext1 = await makeTestExtension(1)
        // Indicate that we have a time lag, and until it returns false
        // we will skip crash checking
        const didLagStub = sandbox.stub(ext1.ext.getTimeLag(), 'didLag')
        didLagStub.returns(true)
        await ext1.ext.start()

        // Since we have a time lag the crash checker will not run
        await awaitIntervals(oneInterval * 2)
        assertCrashedExtensions([])

        // Now that the time lag is true, we will check for a crash
        didLagStub.returns(false)
        await awaitIntervals(oneInterval)
        assertCrashedExtensions([ext0])
    })

    /**
     * Something like the following code can switch contexts early and the test will
     * finish before it has completed. Certain async functions that may take longer to run
     * can cause the issue, an example is a FileSystem call like delete().
     *
     * Example:
     * ```ts
     * globals.clock.setInterval(async () => {
     *   await thisThing
     *
     *   await fs.delete(fileName)
     *
     *   return 'result'
     * })
     * ```
     *
     * Because of this we need be able to block and await on something so that the callback can
     * properly finish. Separately I noticed that if this function Timeout time was too small
     * it would not actually block, and would simply continue.
     *
     * In general this is related to event loop Task Queues.
     *
     */
    async function awaitIntervals(milliseconds: number) {
        await new Promise((resolve) => {
            setTimeout(resolve, milliseconds) // The lower this is, the less the chance this function will actually block the test from continuing
        })
    }

    function assertCrashedExtensions(expectedExts: TestExtension[]) {
        const allSessionEnds = getMetrics('session_end')

        const deduplicatedSessionEnds = deduplicate(
            [...allSessionEnds],
            (a, b) => a.proxiedSessionId === b.proxiedSessionId
        )
        assert.strictEqual(deduplicatedSessionEnds.length, expectedExts.length)

        expectedExts.sort((a, b) => a.metadata.sessionId.localeCompare(b.metadata.sessionId))
        deduplicatedSessionEnds.sort((a, b) => a.proxiedSessionId!.localeCompare(b.proxiedSessionId!))

        expectedExts.forEach((ext, i) => {
            partialDeepCompare(deduplicatedSessionEnds[i], {
                result: 'Failed',
                proxiedSessionId: ext.metadata.sessionId,
                reason: 'ExtHostCrashed',
            })
        })
    }

    function deduplicate<T>(array: T[], predicate: (a: T, b: T) => boolean): T[] {
        return array.filter((item, index, self) => index === self.findIndex((t) => predicate(item, t)))
    }

    describe('FileSystemState', async function () {
        it('ignores irrelevant files in state', async function () {
            const state = await crashMonitoringStateFactory({
                workDirPath: testFolder.path,
                isStateStale: () => Promise.resolve(false),
                sessionId: randomUUID(),
                now: () => globals.clock.Date.now(),
                memento: globals.globalState,
                isDevMode: true,
                devLogger: getLogger(),
            })
            const stateDirPath = state.stateDirPath

            assert.deepStrictEqual((await fs.readdir(stateDirPath)).length, 0)
            await fs.writeFile(path.join(stateDirPath, 'ignoreMe.json'), '')
            await fs.mkdir(path.join(stateDirPath, 'ignoreMe'))
            await state.sendHeartbeat() // creates a relevant file in the state
            assert.deepStrictEqual((await fs.readdir(stateDirPath)).length, 3)

            const result = await state.getAllExts()
            assert.deepStrictEqual(result.length, 1)
        })
    })
}
// This test is slow, so we only want to run it locally and not in CI. It will be run in the integ CI tests though.
;(isCI() ? describe.skip : describe)('CrashReporting', crashMonitoringTest)

type TestExtension = { ext: TestCrashMonitoring; metadata: ExtInstance }
