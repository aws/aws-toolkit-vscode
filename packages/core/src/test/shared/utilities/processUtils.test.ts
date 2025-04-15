/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as os from 'os'
import * as path from 'path'
import * as sinon from 'sinon'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../../shared/filesystemUtilities'
import {
    ChildProcess,
    ChildProcessResult,
    ChildProcessTracker,
    eof,
    ProcessStats,
} from '../../../shared/utilities/processUtils'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { Timeout, waitUntil } from '../../../shared/utilities/timeoutUtils'
import { fs } from '../../../shared'
import * as FakeTimers from '@sinonjs/fake-timers'
import { installFakeClock } from '../../testUtil'
import { isWin } from '../../../shared/vscode/env'
import { assertLogsContain } from '../../globalSetup.test'

describe('ChildProcess', async function () {
    let tempFolder: string

    beforeEach(async function () {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await tryRemoveFolder(tempFolder)
    })

    describe('run', async function () {
        async function assertRegularRun(childProcess: ChildProcess): Promise<void> {
            const result = await childProcess.run()
            assert.strictEqual(result.exitCode, 0, 'Unexpected close code')
            assert.strictEqual(result.stdout, 'hi', 'Unexpected stdout')
        }

        if (process.platform === 'win32') {
            it('starts and captures stdout - windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                await writeBatchFile(batchFile)

                const childProcess = new ChildProcess(batchFile)

                await assertRegularRun(childProcess)
            })

            it('runs cmd files containing a space in the filename and folder', async function () {
                const subfolder: string = path.join(tempFolder, 'sub folder')
                const command: string = path.join(subfolder, 'test script.cmd')

                await fs.mkdir(subfolder)

                await writeWindowsCommandFile(command)

                const childProcess = new ChildProcess(command)

                await assertRegularRun(childProcess)
            })

            it('errs when starting twice - windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                await writeBatchFile(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // We want to verify that the error is thrown even if the first
                // invocation is still in progress, so we don't await the promise.
                childProcess.run().catch(() => {
                    // Do nothing.
                })

                try {
                    await childProcess.run()
                } catch (err) {
                    return
                }

                assert.fail('Expected exception, but none was thrown.')
            })
        } // END Windows only tests

        if (process.platform !== 'win32') {
            it('runs and captures stdout - unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                await writeShellFile(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                await assertRegularRun(childProcess)
            })

            it('errs when starting twice - unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                await writeShellFile(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                // We want to verify that the error is thrown even if the first
                // invocation is still in progress, so we don't await the promise.
                childProcess.run().catch(() => {
                    // Do nothing.
                })

                try {
                    await childProcess.run()
                } catch (err) {
                    return
                }

                assert.fail('Expected exception, but none was thrown.')
            })
        } // END Linux only tests

        it('runs scripts containing a space in the filename and folder', async function () {
            const subfolder: string = path.join(tempFolder, 'sub folder')
            let command: string

            await fs.mkdir(subfolder)

            if (process.platform === 'win32') {
                command = path.join(subfolder, 'test script.bat')
                await writeBatchFile(command)
            } else {
                command = path.join(subfolder, 'test script.sh')
                await writeShellFile(command)
            }

            const childProcess = new ChildProcess(command)

            await assertRegularRun(childProcess)
        })

        it('reports error for missing executable', async function () {
            const batchFile = path.join(tempFolder, 'nonExistentScript')

            const childProcess = new ChildProcess(batchFile)

            const result = await childProcess.run()
            assert.notStrictEqual(result.exitCode, 0, 'Expected an error close code')
        })

        describe('Extra options', function () {
            let childProcess: ChildProcess

            beforeEach(async function () {
                const isWindows = process.platform === 'win32'
                const command = path.join(tempFolder, `test-script.${isWindows ? 'bat' : 'sh'}`)

                if (isWindows) {
                    await writeBatchFile(
                        command,
                        ['@echo %1', '@echo %2', '@echo "%3"', 'SLEEP 20', 'exit 1'].join(os.EOL)
                    )
                } else {
                    await writeShellFile(
                        command,
                        ['echo $1', 'echo $2', 'echo "$3"', 'sleep 20', 'exit 1'].join(os.EOL)
                    )
                }

                childProcess = new ChildProcess(command, ['1', '2'], { collect: false })
            })

            it('can report errors', async function () {
                const result = childProcess.run({
                    rejectOnError: true,
                    useForceStop: true,
                    onStdout: (text, context) => {
                        if (text.includes('2')) {
                            context.reportError('Got 2')
                        }
                    },
                })

                return assert.rejects(result, { message: 'Got 2' })
            })

            it('can reject on errors if `rejectOnError` is set', async function () {
                return await assert.rejects(() =>
                    childProcess.run({
                        rejectOnError: true,
                        onStdout: (text, context) => {
                            context.reportError('An error')
                        },
                    })
                )
            })

            it('kills the process if an error is reported', async function () {
                const result = await childProcess.run({
                    waitForStreams: false,
                    onStdout: (text, context) => {
                        context.reportError('An error')
                    },
                })
                assert.notStrictEqual(result.exitCode, 1)
            })

            it('can merge with base options', async function () {
                const result = await childProcess.run({
                    collect: true,
                    waitForStreams: false,
                    extraArgs: ['4'],
                    onStdout: (text, context) => {
                        if (text.includes('4')) {
                            context.reportError('Got 4')
                        }
                    },
                })
                assert.ok(result.stdout.length !== 0)
                assert.ok(result.error?.message.includes('Got 4'))
            })

            it('uses `Timeout` objects', async function () {
                await childProcess.run({
                    waitForStreams: false,
                    timeout: new Timeout(10),
                })
                assert.strictEqual(childProcess.result()?.signal, 'SIGTERM')
                assert.notStrictEqual(childProcess.result()?.error, undefined)
            })

            it('still runs if the timer completed (not rejected) after starting', async function () {
                const timer = new Timeout(10)
                setTimeout(() => timer.dispose())
                await childProcess.run({
                    waitForStreams: false,
                    onStdout: (text, context) => {
                        context.reportError('Got stuff')
                    },
                })

                assert.strictEqual(childProcess.result()?.error?.message, 'Got stuff')
            })

            it('rejects if using a completed timer', async function () {
                const timer = new Timeout(10)
                timer.dispose()
                await assert.rejects(childProcess.run({ timeout: timer }))
                assert.strictEqual(childProcess.result(), undefined)
                // Just make sure no process was ever ran
                await sleep(20)
                assert.strictEqual(childProcess.result(), undefined)
            })
        })
    })

    describe('stop()', async function () {
        if (process.platform === 'win32') {
            it('detects running processes and successfully stops a running process - Windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                await writeBatchFileWithDelays(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // `await` is intentionally not used, we want to check the process while it runs.
                childProcess.run().catch(() => {
                    // Do nothing.
                })

                assert.strictEqual(childProcess.stopped, false)
                childProcess.stop()
                await waitUntil(async () => childProcess.stopped, { timeout: 1000, interval: 100, truthy: true })
                assert.strictEqual(childProcess.stopped, true)
            })

            it('can stop() previously stopped processes - Windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                await writeBatchFileWithDelays(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // `await` is intentionally not used, we want to check the process while it runs.
                childProcess.run().catch(() => {
                    // Do nothing.
                })

                childProcess.stop()
                await waitUntil(async () => childProcess.stopped, { timeout: 1000, interval: 100, truthy: true })
                assert.strictEqual(childProcess.stopped, true)
                assert.doesNotThrow(() => childProcess.stop())
            })
        } // END Windows-only tests

        if (process.platform !== 'win32') {
            it('detects running processes and successfully stops a running process - Unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                await writeShellFileWithDelays(scriptFile)

                const childProcess = new ChildProcess('sh', [scriptFile])
                const result = childProcess.run()

                assert.strictEqual(childProcess.stopped, false)
                childProcess.stop()
                await result

                assert.strictEqual(childProcess.stopped, true)
            })

            it('can stop() previously stopped processes - Unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                await writeShellFileWithDelays(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                const result = childProcess.run()

                childProcess.stop()
                await result

                assert.strictEqual(childProcess.stopped, true)
                assert.doesNotThrow(() => childProcess.stop())
            })

            it('can send input - Unix', async function () {
                const childProcess = new ChildProcess('cat')
                const result = childProcess.run()
                await childProcess.send('foo')
                await childProcess.send(eof)
                const { stdout } = await result
                assert.strictEqual(stdout, 'foo')
            })
        } // END Unix-only tests
    })

    async function writeBatchFile(filename: string, contents?: string): Promise<void> {
        await fs.writeFile(filename, contents ?? '@echo hi')
    }

    async function writeBatchFileWithDelays(filename: string): Promise<void> {
        const file = `
        @echo hi
        SLEEP 20
        @echo bye`
        await fs.writeFile(filename, file)
    }

    async function writeWindowsCommandFile(filename: string): Promise<void> {
        await fs.writeFile(filename, `@echo OFF${os.EOL}echo hi`)
    }

    async function writeShellFile(filename: string, contents = 'echo hi'): Promise<void> {
        await fs.writeFile(filename, `#!/bin/sh\n${contents}`)
        await fs.chmod(filename, 0o744)
    }

    async function writeShellFileWithDelays(filename: string): Promise<void> {
        const file = `
        echo hi
        sleep 20
        echo bye`
        await writeShellFile(filename, file)
    }
})

interface RunningProcess {
    childProcess: ChildProcess
    result: Promise<ChildProcessResult>
}

function getSleepCmd() {
    return isWin() ? 'timeout' : 'sleep'
}

async function stopAndWait(runningProcess: RunningProcess): Promise<void> {
    runningProcess.childProcess.stop(true)
    await runningProcess.result
}

function startSleepProcess(timeout: number = 90): RunningProcess {
    const childProcess = new ChildProcess(getSleepCmd(), [timeout.toString()])
    const result = childProcess.run().catch(() => assert.fail('sleep command threw an error'))
    return { childProcess, result }
}

describe('ChildProcessTracker', function () {
    let tracker: ChildProcessTracker
    let clock: FakeTimers.InstalledClock
    let usageMock: sinon.SinonStub

    before(function () {
        clock = installFakeClock()
        tracker = new ChildProcessTracker()
        usageMock = sinon.stub(ChildProcessTracker.prototype, 'getUsage')
    })

    beforeEach(function () {
        ChildProcessTracker.loggedPids.clear()
    })

    afterEach(function () {
        tracker.clear()
        usageMock.reset()
    })

    after(function () {
        clock.uninstall()
    })

    it(`removes stopped processes every ${ChildProcessTracker.pollingInterval / 1000} seconds`, async function () {
        // Start a 'sleep' command, check it only removes after we stop it.
        const runningProcess = startSleepProcess()
        tracker.add(runningProcess.childProcess)
        assert.strictEqual(tracker.has(runningProcess.childProcess), true, 'failed to add sleep command')

        await clock.tickAsync(ChildProcessTracker.pollingInterval)
        assert.strictEqual(tracker.has(runningProcess.childProcess), true, 'process was mistakenly removed')
        await stopAndWait(runningProcess)

        await clock.tickAsync(ChildProcessTracker.pollingInterval)
        assert.strictEqual(tracker.has(runningProcess.childProcess), false, 'process was not removed after stopping')
    })

    it('multiple processes from same command are tracked seperately', async function () {
        const runningProcess1 = startSleepProcess()
        const runningProcess2 = startSleepProcess()
        tracker.add(runningProcess1.childProcess)
        tracker.add(runningProcess2.childProcess)

        assert.strictEqual(tracker.has(runningProcess1.childProcess), true, 'Missing first process')
        assert.strictEqual(tracker.has(runningProcess2.childProcess), true, 'Missing second process')

        await stopAndWait(runningProcess1)
        await clock.tickAsync(ChildProcessTracker.pollingInterval)
        assert.strictEqual(tracker.has(runningProcess2.childProcess), true, 'second process was mistakenly removed')
        assert.strictEqual(
            tracker.has(runningProcess1.childProcess),
            false,
            'first process was not removed after stopping it'
        )

        await stopAndWait(runningProcess2)
        await clock.tickAsync(ChildProcessTracker.pollingInterval)
        assert.strictEqual(
            tracker.has(runningProcess2.childProcess),
            false,
            'second process was not removed after stopping it'
        )

        assert.strictEqual(tracker.size, 0, 'expected tracker to be empty')
    })

    it('logs a warning message when system usage exceeds threshold', async function () {
        const runningProcess = startSleepProcess()
        tracker.add(runningProcess.childProcess)

        const highCpu: ProcessStats = {
            cpu: ChildProcessTracker.thresholds.cpu + 1,
            memory: 0,
        }
        const highMemory: ProcessStats = {
            cpu: 0,
            memory: ChildProcessTracker.thresholds.memory + 1,
        }

        usageMock.returns(highCpu)

        await clock.tickAsync(ChildProcessTracker.pollingInterval)
        assertLogsContain('exceeded cpu threshold', false, 'warn')

        ChildProcessTracker.loggedPids.clear()
        usageMock.returns(highMemory)
        await clock.tickAsync(ChildProcessTracker.pollingInterval)
        assertLogsContain('exceeded memory threshold', false, 'warn')

        await stopAndWait(runningProcess)
    })

    it('includes pid in logs', async function () {
        const runningProcess = startSleepProcess()
        tracker.add(runningProcess.childProcess)

        usageMock.returns({
            cpu: ChildProcessTracker.thresholds.cpu + 1,
            memory: 0,
        })

        await clock.tickAsync(ChildProcessTracker.pollingInterval)
        assertLogsContain(runningProcess.childProcess.pid().toString(), false, 'warn')

        await stopAndWait(runningProcess)
    })

    it('does not log for processes within threshold', async function () {
        const runningProcess = startSleepProcess()

        usageMock.returns({
            cpu: ChildProcessTracker.thresholds.cpu - 1,
            memory: ChildProcessTracker.thresholds.memory - 1,
        })

        await clock.tickAsync(ChildProcessTracker.pollingInterval)

        assert.throws(() => assertLogsContain(runningProcess.childProcess.pid().toString(), false, 'warn'))

        await stopAndWait(runningProcess)
    })
})
