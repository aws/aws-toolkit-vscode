/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { assertTelemetry, getMetrics, partialDeepCompare, TestFolder } from '../../testUtil'
import assert from 'assert'
import globals from '../../../shared/extensionGlobals'
import {
    CrashMonitoring,
    ExtInstance,
    crashMonitoringStateFactory,
} from '../../../shared/crashMonitoring/crashMonitoring'
import { isCI } from '../../../shared/vscode/env'
import { getLogger } from '../../../shared/logger/logger'

class TestCrashMonitoring extends CrashMonitoring {
    public constructor(...deps: ConstructorParameters<typeof CrashMonitoring>) {
        super(...deps)
    }
    public override crash() {
        super.crash()
    }
}

export const crashMonitoringTest = async () => {
    let testFolder: TestFolder
    let spawnedExtensions: TestCrashMonitoring[]

    // Scale down the default interval we heartbeat and check for crashes to something much short for testing.
    const checkInterval = 200

    // Add some buffer since after 1 interval the work is actually done, including file i/o which may be slow.
    // **IF FLAKY**, see if increasing the buffer helps.
    const oneInterval = checkInterval + 500

    /**
     * Makes N "extension instances" that can be used for testing.
     * Each instances is actually the Crash Reporting instance, but there is a
     * 1:1 mapping between Crash Reporting instances and the Extension instances.
     */
    async function makeTestExtensions(amount: number) {
        const devLogger = getLogger()

        const extensions: TestExtension[] = []
        for (let i = 0; i < amount; i++) {
            const sessionId = `sessionId-${i}`
            const pid = Number(String(i).repeat(6))
            const state = await crashMonitoringStateFactory({
                workDirPath: testFolder.path,
                isStateStale: async () => false,
                pid,
                sessionId: sessionId,
                now: () => globals.clock.Date.now(),
                memento: globals.globalState,
                isDevMode: true,
                devLogger,
            })
            const ext = new TestCrashMonitoring(state, checkInterval, true, false, devLogger)
            spawnedExtensions.push(ext)
            const metadata = {
                extHostPid: pid,
                sessionId,
                lastHeartbeat: globals.clock.Date.now(),
                isDebug: undefined,
            }
            extensions[i] = { ext, metadata }
        }
        return extensions
    }

    beforeEach(async function () {
        testFolder = await TestFolder.create()
        spawnedExtensions = []
    })

    afterEach(async function () {
        // clean up all running instances
        spawnedExtensions?.forEach((e) => e.crash())
    })

    it('graceful shutdown no metric emitted', async function () {
        // this.retries(3)

        const exts = await makeTestExtensions(2)

        await exts[0].ext.start()
        await awaitIntervals(oneInterval) // allow time to become primary checker
        // There is no other active instance to report the issue
        assertTelemetry('session_end', [])

        // Ext 1 does a graceful shutdown
        await exts[1].ext.start()
        await exts[1].ext.stop()
        await awaitIntervals(oneInterval)
        // Ext 1 did a graceful shutdown so no metric emitted
        assertTelemetry('session_end', [])
    })

    it('single running instances crashes, so nothing is reported, but a new instaces appears and reports', async function () {
        // this.retries(3)

        const exts = await makeTestExtensions(2)

        await exts[0].ext.start()
        exts[0].ext.crash()
        await awaitIntervals(oneInterval)
        // There is no other active instance to report the issue
        assertTelemetry('session_end', [])

        await exts[1].ext.start()
        await awaitIntervals(oneInterval)
        // Starting a new instance will detect the previously crashed one
        assertCrashedExtensions([exts[0]])
    })

    it('start the first extension, then start many subsequent ones and crash them all at once', async function () {
        // this.retries(3)
        const latestCrashedExts: TestExtension[] = []

        const extCount = 10
        const exts = await makeTestExtensions(extCount)
        for (let i = 0; i < extCount; i++) {
            await exts[i].ext.start()
        }

        for (let i = 1; i < extCount; i++) {
            exts[i].ext.crash()
            latestCrashedExts.push(exts[i])
        }

        // Give some extra time since there is a lot of file i/o
        await awaitIntervals(oneInterval * 2)

        assertCrashedExtensions(latestCrashedExts)
    })

    it('the Primary checker crashes and another checker is promoted to Primary', async function () {
        // this.retries(3)
        const latestCrashedExts: TestExtension[] = []

        const exts = await makeTestExtensions(4)
        // Ext 0 is the Primary checker
        await exts[0].ext.start()
        await awaitIntervals(oneInterval)

        // start Ext 1 then crash it, Ext 0 finds the crash
        await exts[1].ext.start()
        exts[1].ext.crash()
        latestCrashedExts.push(exts[1])
        await awaitIntervals(oneInterval * 1)

        assertCrashedExtensions(latestCrashedExts)

        // start Ext 2 and crash Ext 0, Ext 2 is promoted to Primary checker
        await exts[2].ext.start()
        exts[0].ext.crash()
        latestCrashedExts.push(exts[0])
        await awaitIntervals(oneInterval * 1)
        assertCrashedExtensions(latestCrashedExts)

        // Ext 3 starts, then crashes. Ext 2 reports the crash since it is the Primary checker
        await exts[3].ext.start()
        exts[3].ext.crash()
        latestCrashedExts.push(exts[3])
        await awaitIntervals(oneInterval * 1)
        assertCrashedExtensions(latestCrashedExts)
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
}
// This test is slow, so we only want to run it locally and not in CI. It will be run in the integ CI tests though.
;(isCI() ? describe.skip : describe)('CrashReporting', crashMonitoringTest)

type TestExtension = { ext: TestCrashMonitoring; metadata: ExtInstance }
