/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { ChildProcess, ChildProcessResult } from '../../../shared/utilities/childProcess'
import { sleep } from '../../../shared/utilities/promiseUtilities'
import { Timeout, waitUntil } from '../../../shared/utilities/timeoutUtils'

describe('ChildProcess', async function () {
    let tempFolder: string

    beforeEach(async function () {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await fs.remove(tempFolder)
    })

    describe('run', async function () {
        if (process.platform === 'win32') {
            it('runs and captures stdout - windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFile(batchFile)

                const childProcess = new ChildProcess(batchFile)

                const result = await childProcess.run()

                validateChildProcessResult({
                    childProcessResult: result,
                    expectedExitCode: 0,
                    expectedOutput: 'hi',
                })
            })

            it('runs cmd files containing a space in the filename and folder', async function () {
                const subfolder: string = path.join(tempFolder, 'sub folder')
                const command: string = path.join(subfolder, 'test script.cmd')

                fs.mkdirSync(subfolder)

                writeWindowsCommandFile(command)

                const childProcess = new ChildProcess(command)

                const result = await childProcess.run()

                validateChildProcessResult({
                    childProcessResult: result,
                    expectedExitCode: 0,
                    expectedOutput: 'hi',
                })
            })

            it('errs when starting twice - windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFile(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // We want to verify that the error is thrown even if the first
                // invocation is still in progress, so we don't await the promise.
                childProcess.run()

                try {
                    await childProcess.run()
                } catch (err) {
                    return
                }

                assert.fail('Expected exception, but none was thrown.')
            })
        } else {
            it('runs and captures stdout - unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFile(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                const result = await childProcess.run()

                validateChildProcessResult({
                    childProcessResult: result,
                    expectedExitCode: 0,
                    expectedOutput: 'hi',
                })
            })

            it('errs when starting twice - unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFile(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                // We want to verify that the error is thrown even if the first
                // invocation is still in progress, so we don't await the promise.
                childProcess.run()

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

            fs.mkdirSync(subfolder)

            if (process.platform === 'win32') {
                command = path.join(subfolder, 'test script.bat')
                writeBatchFile(command)
            } else {
                command = path.join(subfolder, 'test script.sh')
                writeShellFile(command)
            }

            const childProcess = new ChildProcess(command)

            const result = await childProcess.run()

            validateChildProcessResult({
                childProcessResult: result,
                expectedExitCode: 0,
                expectedOutput: 'hi',
            })
        })

        it('reports error for missing executable', async function () {
            const batchFile = path.join(tempFolder, 'nonExistentScript')

            const childProcess = new ChildProcess(batchFile)

            const result = await childProcess.run()

            assert.notStrictEqual(result.exitCode, 0)
            assert.notStrictEqual(result.error, undefined)
        })

        function validateChildProcessResult({
            childProcessResult,
            expectedExitCode,
            expectedOutput,
        }: {
            childProcessResult: ChildProcessResult
            expectedExitCode: number
            expectedOutput: string
        }) {
            assert.strictEqual(
                childProcessResult.exitCode,
                expectedExitCode,
                `Expected exit code ${expectedExitCode}, got ${childProcessResult.exitCode}`
            )

            assert.strictEqual(
                childProcessResult.stdout,
                expectedOutput,
                `Expected stdout to be ${expectedOutput} , got: ${childProcessResult.stdout}`
            )
        }
    })

    describe('run', async function () {
        async function assertRegularRun(childProcess: ChildProcess): Promise<void> {
            const result = await childProcess.run({
                onStdout: text => {
                    assert.strictEqual(text, 'hi' + os.EOL, 'Unexpected stdout')
                },
            })
            assert.strictEqual(result.exitCode, 0, 'Unexpected close code')
        }

        if (process.platform === 'win32') {
            it('starts and captures stdout - windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFile(batchFile)

                const childProcess = new ChildProcess(batchFile)

                await assertRegularRun(childProcess)
            })

            it('runs cmd files containing a space in the filename and folder', async function () {
                const subfolder: string = path.join(tempFolder, 'sub folder')
                const command: string = path.join(subfolder, 'test script.cmd')

                fs.mkdirSync(subfolder)

                writeWindowsCommandFile(command)

                const childProcess = new ChildProcess(command)

                await assertRegularRun(childProcess)
            })

            it('errs when starting twice - windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFile(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // We want to verify that the error is thrown even if the first
                // invocation is still in progress, so we don't await the promise.
                childProcess.run()

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
                writeShellFile(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                await assertRegularRun(childProcess)
            })

            it('errs when starting twice - unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFile(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                // We want to verify that the error is thrown even if the first
                // invocation is still in progress, so we don't await the promise.
                childProcess.run()

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

            fs.mkdirSync(subfolder)

            if (process.platform === 'win32') {
                command = path.join(subfolder, 'test script.bat')
                writeBatchFile(command)
            } else {
                command = path.join(subfolder, 'test script.sh')
                writeShellFile(command)
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

            beforeEach(function () {
                const isWindows = process.platform === 'win32'
                const command = path.join(tempFolder, `test-script.${isWindows ? 'bat' : 'sh'}`)

                if (isWindows) {
                    writeBatchFile(command, ['@echo %1', '@echo %2', '@echo "%3"', 'SLEEP 20', 'exit 1'].join(os.EOL))
                } else {
                    writeShellFile(command, ['echo $1', 'echo $2', 'echo "$3"', 'sleep 20', 'exit 1'].join(os.EOL))
                }

                childProcess = new ChildProcess(command, ['1', '2'], { collect: false })
            })

            it('can report errors', async function () {
                const result = childProcess.run({
                    rejectOnError: true,
                    onStdout(text) {
                        if (text.includes('2')) {
                            this.reportError('Got 2')
                        }
                    },
                })

                return assert.rejects(result, { message: 'Got 2' })
            })

            it('can reject on errors if `rejectOnError` is set', async function () {
                return await assert.rejects(() =>
                    childProcess.run({
                        rejectOnError: true,
                        onStdout() {
                            this.reportError('An error')
                        },
                    })
                )
            })

            it('can kill the process if `stopOnError` is set', async function () {
                const result = await childProcess.run({
                    stopOnError: true,
                    waitForStreams: false,
                    onStdout() {
                        this.reportError('An error')
                    },
                })
                assert.notStrictEqual(result.exitCode, 1)
            })

            it('can merge with base options', async function () {
                const result = await childProcess.run({
                    collect: true,
                    stopOnError: true,
                    waitForStreams: false,
                    extraArgs: ['4'],
                    onStdout(text) {
                        if (text.includes('4')) {
                            this.reportError('Got 4')
                        }
                    },
                })
                assert.ok(result.stdout.length !== 0)
                assert.ok(result.error?.message.includes('Got 4'))
            })

            it('uses `Timeout` objects', async function () {
                await childProcess.run({
                    stopOnError: true,
                    waitForStreams: false,
                    timeout: new Timeout(10),
                })
                assert.strictEqual(childProcess.result()?.signal, 'SIGTERM')
                assert.notStrictEqual(childProcess.result()?.error, undefined)
            })

            it('still runs if the timer completed (not rejected) after starting', async function () {
                const timer = new Timeout(10)
                setTimeout(() => timer.complete())
                await childProcess.run({
                    stopOnError: true,
                    waitForStreams: false,
                    onStdout() {
                        this.reportError('Got stuff')
                    },
                })

                assert.strictEqual(childProcess.result()?.error?.message, 'Got stuff')
            })

            it('rejects if using a completed timer', async function () {
                const timer = new Timeout(10)
                timer.complete()
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
                writeBatchFileWithDelays(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // `await` is intentionally not used, we want to check the process while it runs.
                childProcess.run()

                assert.strictEqual(childProcess.stopped, false)
                childProcess.stop()
                await waitUntil(async () => childProcess.stopped, { timeout: 1000, interval: 100, truthy: true })
                assert.strictEqual(childProcess.stopped, true)
            })

            it('cannot stop() previously stopped processes - Windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFileWithDelays(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // `await` is intentionally not used, we want to check the process while it runs.
                childProcess.run()

                childProcess.stop()
                await waitUntil(async () => childProcess.stopped, { timeout: 1000, interval: 100, truthy: true })
                assert.strictEqual(childProcess.stopped, true)
                assert.throws(() => {
                    childProcess.stop()
                })
            })
        } // END Windows-only tests

        if (process.platform !== 'win32') {
            it('detects running processes and successfully stops a running process - Unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFileWithDelays(scriptFile)

                const childProcess = new ChildProcess('sh', [scriptFile])

                // `await` is intentionally not used, we want to check the process while it runs.
                childProcess.run()

                assert.strictEqual(childProcess.stopped, false)
                childProcess.stop()
                await waitUntil(async () => childProcess.stopped, { timeout: 1000, interval: 100, truthy: true })
                assert.strictEqual(childProcess.stopped, true)
            })

            it('cannot stop() previously stopped processes - Unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFileWithDelays(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                // `await` is intentionally not used, we want to check the process while it runs.
                childProcess.run()

                childProcess.stop()
                await waitUntil(async () => childProcess.stopped, { timeout: 1000, interval: 100, truthy: true })
                assert.strictEqual(childProcess.stopped, true)
                assert.throws(() => {
                    childProcess.stop()
                })
            })
        } // END Unix-only tests
    })

    function writeBatchFile(filename: string, contents?: string): void {
        fs.writeFileSync(filename, contents ?? '@echo hi')
    }

    function writeBatchFileWithDelays(filename: string): void {
        const file = `
        @echo hi
        SLEEP 20
        @echo bye`
        fs.writeFileSync(filename, file)
    }

    function writeWindowsCommandFile(filename: string): void {
        fs.writeFileSync(filename, `@echo OFF${os.EOL}echo hi`)
    }

    function writeShellFile(filename: string, contents?: string): void {
        fs.writeFileSync(filename, contents ?? 'echo hi')
        fs.chmodSync(filename, 0o744)
    }

    function writeShellFileWithDelays(filename: string): void {
        const file = `
        echo hi
        sleep 20
        echo bye`
        fs.writeFileSync(filename, file)
        fs.chmodSync(filename, 0o744)
    }
})
